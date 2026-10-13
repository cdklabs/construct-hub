import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Billing, Capacity } from 'aws-cdk-lib/aws-dynamodb';
import { ConstructHub } from '../../construct-hub';
import { NpmJs } from '../../package-sources';

function synth(npmJs: NpmJs): Template {
  const app = new App();
  const stack = new Stack(app, 'Test');
  new ConstructHub(stack, 'ConstructHub', { packageSources: [npmJs] });
  return Template.fromStack(stack);
}

test('creates a retained, backed-up, on-demand known versions table', () => {
  const template = synth(new NpmJs());

  template.hasResource('AWS::DynamoDB::GlobalTable', {
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
    Properties: Match.objectLike({
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        { AttributeName: 'name', KeyType: 'HASH' },
        { AttributeName: 'version', KeyType: 'RANGE' },
      ],
      Replicas: [
        Match.objectLike({
          PointInTimeRecoverySpecification: {
            PointInTimeRecoveryEnabled: true,
          },
        }),
      ],
    }),
  });
});

test('passes the known versions table to the packument processor', () => {
  const template = synth(new NpmJs());

  template.hasResourceProperties('AWS::Lambda::Function', {
    Description: Match.stringLikeRegexp(
      'Processes packages from the npm registry'
    ),
    Environment: {
      Variables: Match.objectLike({
        KNOWN_VERSIONS_TABLE_NAME: Match.anyValue(),
      }),
    },
  });
});

test('migrates existing known versions before the follower is updated, and catches up after', () => {
  const template = synth(new NpmJs());

  const migrations = template.findResources('AWS::Lambda::Function', {
    Properties: {
      Description: Match.stringLikeRegexp('Copies the known versions'),
    },
  });
  expect(Object.keys(migrations)).toHaveLength(1);
  const [migrationId] = Object.keys(migrations);

  const versions = template.findResources('AWS::Lambda::Version', {
    Properties: { FunctionName: { Ref: migrationId } },
  });
  expect(Object.keys(versions)).toHaveLength(1);

  const triggers = template.findResources('Custom::Trigger', {
    Properties: {
      HandlerArn: { Ref: Object.keys(versions)[0] },
      InvocationType: 'RequestResponse',
      ExecuteOnHandlerChange: false,
    },
  });
  expect(Object.keys(triggers)).toHaveLength(1);
  const [triggerId] = Object.keys(triggers);

  // The follower function is only deployed after the migration ran.
  const followers = template.findResources('AWS::Lambda::Function', {
    Properties: {
      Description: Match.stringLikeRegexp('Periodically query npmjs.com'),
    },
  });
  expect(Object.keys(followers)).toHaveLength(1);
  expect(Object.values(followers)[0].DependsOn).toContain(triggerId);
  const [followerId] = Object.keys(followers);

  // A second pass after the follower update picks up what the old follower
  // code recorded in the meantime.
  const catchUps = template.findResources('Custom::Trigger', {
    Properties: {
      HandlerArn: { Ref: Object.keys(versions)[0] },
      InvocationType: 'Event',
      ExecuteOnHandlerChange: false,
    },
  });
  expect(Object.keys(catchUps)).toHaveLength(1);
  expect(Object.values(catchUps)[0].DependsOn).toContain(followerId);
});

test('the known versions migration can be turned off', () => {
  const template = synth(new NpmJs({ enableKnownVersionsMigration: false }));

  template.resourceCountIs('Custom::Trigger', 0);
  expect(
    Object.keys(
      template.findResources('AWS::Lambda::Function', {
        Properties: {
          Description: Match.stringLikeRegexp('Copies the known versions'),
        },
      })
    )
  ).toHaveLength(0);
});

test('retries packuments through a queue, with a dead-letter queue as a backstop', () => {
  const template = synth(new NpmJs());

  const dlqs = template.findResources('AWS::SQS::Queue', {
    Properties: { MessageRetentionPeriod: 14 * 24 * 60 * 60 },
  });
  template.hasResourceProperties('AWS::SQS::Queue', {
    MessageRetentionPeriod: 14 * 24 * 60 * 60,
    VisibilityTimeout: 30 * 60,
    RedrivePolicy: {
      deadLetterTargetArn: {
        'Fn::GetAtt': [Match.stringLikeRegexp('PackumentProcessorDLQ'), 'Arn'],
      },
      maxReceiveCount: 20,
    },
  });
  expect(
    Object.keys(dlqs).some((id) => id.includes('PackumentProcessorDLQ'))
  ).toBe(true);

  const processors = template.findResources('AWS::Lambda::Function', {
    Properties: {
      Description: Match.stringLikeRegexp(
        'Processes packages from the npm registry'
      ),
    },
  });
  expect(Object.keys(processors)).toHaveLength(1);
  const [processorId, processor] = Object.entries(processors)[0] as [
    string,
    any
  ];
  template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
    FunctionName: { Ref: processorId },
    BatchSize: 10,
    FunctionResponseTypes: ['ReportBatchItemFailures'],
    ScalingConfig: { MaximumConcurrency: 10 },
  });

  // It only reads the main queue, which hides messages for longer than the
  // function runs.
  const queueIds = Object.values(
    template.findResources('AWS::Lambda::EventSourceMapping', {
      Properties: { FunctionName: { Ref: processorId } },
    })
  ).map((mapping: any) => mapping.Properties.EventSourceArn['Fn::GetAtt'][0]);
  expect(queueIds).toHaveLength(1);
  expect(queueIds[0]).not.toContain('DLQ');
  const queues = template.findResources('AWS::SQS::Queue');
  for (const queueId of queueIds) {
    // Unset means the SQS default of 30 seconds.
    const visibility = queues[queueId].Properties.VisibilityTimeout ?? 30;
    expect(visibility).toBeGreaterThanOrEqual(processor.Properties.Timeout);
  }

  // There is no alarm on the dead-letter queue (it is only graphed), and no
  // alarm on give-ups.
  const alarmNames = Object.values(
    template.findResources('AWS::CloudWatch::Alarm')
  ).map((alarm: any) => String(alarm.Properties.AlarmName));
  expect(
    alarmNames.some(
      (name) =>
        name.endsWith('DLQNotEmpty') && name.includes('PackumentProcessor')
    )
  ).toBe(false);
  expect(alarmNames.some((name) => name.includes('GiveUps'))).toBe(false);

  // Many packages waiting for the registry for 3 hours raise an alarm.
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    AlarmName:
      'Test/ConstructHub/Sources/NpmJs/PackumentProcessor/PendingPackumentsHigh',
    MetricName: 'ApproximateNumberOfMessagesNotVisible',
    Namespace: 'AWS/SQS',
    Period: 60 * 60,
    Statistic: 'Minimum',
    EvaluationPeriods: 3,
    Threshold: 2_000,
  });
  expect(
    alarmNames.some((name) => name.endsWith('MissingPackumentsHigh'))
  ).toBe(false);
  // So does a high packument delay. The alarm keeps its name.
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    AlarmName:
      'Test/ConstructHub/Sources/NpmJs/PackumentProcessor/LaggyPackumentLagHigh',
    MetricName: 'PackumentDelay',
    Period: 3 * 60 * 60,
    ExtendedStatistic: 'p90',
    Threshold: 6 * 60 * 60,
  });

  // Processor failures raise a low severity alarm too.
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    AlarmName: 'Test/ConstructHub/Sources/NpmJs/PackumentProcessor/Failures',
    MetricName: 'Errors',
  });

  // The follower sends laggy packuments to the queue.
  template.hasResourceProperties('AWS::Lambda::Function', {
    Description: Match.stringLikeRegexp('Periodically query npmjs.com'),
    Environment: {
      Variables: Match.objectLike({ PACKUMENT_QUEUE_URL: Match.anyValue() }),
    },
  });
});

test('the follower only reads the feed and sends requests to the packument queue', () => {
  const template = synth(new NpmJs());

  const followers = template.findResources('AWS::Lambda::Function', {
    Properties: {
      Description: Match.stringLikeRegexp('Periodically query npmjs.com'),
    },
  });
  expect(Object.keys(followers)).toHaveLength(1);
  const [follower] = Object.values(followers) as any[];
  expect(Object.keys(follower.Properties.Environment.Variables).sort()).toEqual(
    ['AWS_EMF_ENVIRONMENT', 'BUCKET_NAME', 'PACKUMENT_QUEUE_URL']
  );
  expect(follower.Properties.MemorySize).toBe(2_048);

  // Its role has no access to the known versions table or the stager.
  const roleRef = follower.Properties.Role['Fn::GetAtt'][0];
  const policies = Object.values(
    template.findResources('AWS::IAM::Policy')
  ).filter((policy: any) =>
    JSON.stringify(policy.Properties.Roles).includes(roleRef)
  );
  const actions = JSON.stringify(
    policies.map((policy: any) => policy.Properties.PolicyDocument.Statement)
  );
  expect(actions).not.toContain('dynamodb:');
  expect(actions).not.toContain('lambda:InvokeFunction');
  expect(actions).toContain('sqs:SendMessage');
});

test('the billing mode of the known versions table is configurable', () => {
  const template = synth(
    new NpmJs({
      knownVersionsTableBilling: Billing.provisioned({
        readCapacity: Capacity.fixed(10),
        writeCapacity: Capacity.autoscaled({ maxCapacity: 20 }),
      }),
    })
  );

  template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
    BillingMode: 'PROVISIONED',
  });
});
