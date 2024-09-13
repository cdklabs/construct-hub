import * as path from 'path';
import { ExpectedResult, IntegTest } from '@aws-cdk/integ-tests-alpha';
import { App, ArnFormat, Duration, Stack } from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { JsonPath, Pass, StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Transliterator } from '../lib/backend/transliterator';

const app = new App();
const stack = new Stack(app, 'TransliteratorEcsTaskInteg');

const bucket = new Bucket(stack, 'Bucket');
const cluster = new Cluster(stack, 'Cluster', {
  enableFargateCapacityProviders: true,
  vpc: new Vpc(stack, 'Vpc', {
    maxAzs: 2,
    restrictDefaultSecurityGroup: false,
  }),
});
const transliterator = new Transliterator(stack, 'Transliterator', {
  bucket,
  monitoring: {
    addHighSeverityAlarm: () => {},
    addLowSeverityAlarm: () => {},
  },
});

// ecr permissions copied from code in transliterator/index.ts
transliterator.taskDefinition.addToExecutionRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['ecr:GetAuthorizationToken'],
    resources: ['*'], // Action does not support resource scoping
  })
);
transliterator.taskDefinition.addToExecutionRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'ecr:BatchCheckLayerAvailability',
      'ecr:GetDownloadUrlForLayer',
      'ecr:BatchGetImage',
    ],
    // We cannot get the ECR repository info from an asset... So scoping down to same-account repositories instead...
    resources: [
      stack.formatArn({
        service: 'ecr',
        resource: 'repository',
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
        resourceName: '*',
      }),
    ],
  })
);

const source = Source.asset(
  path.join(__dirname, 'fixtures/transliterator/package')
);
new BucketDeployment(stack, 'BucketDeployment', {
  sources: [source],
  destinationBucket: bucket,
  destinationKeyPrefix: 'data/package-name/v1.2.3-dev.4',
});

const definition = new Pass(stack, 'Track Execution Infos', {
  inputPath: '$$.Execution',
  parameters: {
    'Id.$': '$.Id',
    'Name.$': '$.Name',
    'RoleArn.$': '$.RoleArn',
    'StartTime.$': '$.StartTime',
  },
  resultPath: '$.$TaskExecution',
})
  .next(
    new Pass(stack, 'Prepare doc-gen ECS Command', {
      parameters: { 'command.$': 'States.Array(States.JsonToString($))' },
      resultPath: '$.docGen',
    })
  )
  .next(
    transliterator.createEcsRunTask(stack, 'Generate docs', {
      cluster,
      inputPath: '$.docGen.command',
      resultPath: JsonPath.DISCARD,
      timeout: Duration.minutes(5),
    })
  );

const stateMachine = new StateMachine(stack, 'StateMachine', {
  definition,
});
transliterator.taskDefinition.grantRun(stateMachine);

const event = {
  bucket: bucket.bucketName,
  assembly: {
    key: 'data/package-name/v1.2.3-dev.4/assembly.json',
  },
  package: {
    key: 'data/package-name/v1.2.3-dev.4/package.tgz',
  },
};

const integTest = new IntegTest(app, 'transliterator-integ', {
  testCases: [stack],
});

const res = integTest.assertions.awsApiCall('StepFunctions', 'startExecution', {
  stateMachineArn: stateMachine.stateMachineArn,
  input: JSON.stringify(event),
});
const executionArn = res.getAttString('executionArn');
integTest.assertions
  .awsApiCall('StepFunctions', 'describeExecution', {
    executionArn,
  })
  .expect(
    ExpectedResult.objectLike({
      status: 'SUCCEEDED',
    })
  )
  .waitForAssertions({
    totalTimeout: Duration.minutes(3),
    interval: Duration.seconds(10),
  });
