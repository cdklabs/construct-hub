import { Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { IAlarmAction, Alarm, Metric } from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Monitoring } from '../monitoring';

const actions = {
  highSeverity: 'arn:aws:sns:us-east-1:123456789012:high',
  normalSeverity: 'arn:aws:sns:us-east-1:123456789012:normal',
};

test('minimal', () => {
  // GIVEN
  const stack = new Stack();

  // WHEN
  new Monitoring(stack, 'Monitoring', {
    alarmActions: actions,
  });

  // a dashboard is automatically created
  Template.fromStack(stack).hasResource(
    'AWS::CloudWatch::Dashboard',
    Match.anyValue()
  );
});

test('watchful can be used for setting up automatic monitoring', () => {
  // GIVEN
  const stack = new Stack();
  const fn = new lambda.Function(stack, 'Function', {
    runtime: lambda.Runtime.NODEJS_20_X,
    code: lambda.Code.fromInline('foo'),
    handler: 'index.handler',
  });
  const monitoring = new Monitoring(stack, 'Monitoring', {
    alarmActions: actions,
  });

  // WHEN
  monitoring.watchful.watchLambdaFunction('My Function', fn);

  // an alarm is automatically created for this function
  Template.fromStack(stack).hasResourceProperties('AWS::CloudWatch::Alarm', {
    Namespace: 'AWS/Lambda',
    MetricName: 'Errors',
    //TODO: uncomment when we can use cdk-watchful 0.145.0 or above
    // AlarmActions: ['arn:aws:sns:us-east-1:123456789012:normal'],
    Dimensions: [{ Name: 'FunctionName', Value: { Ref: 'Function76856677' } }],
  });
});

test('high severity alarms trigger the correct action', () => {
  // GIVEN
  const stack = new Stack();
  const topic = new sns.Topic(stack, 'Topic');
  const monitoring = new Monitoring(stack, 'Monitoring', {
    alarmActions: actions,
  });
  const alarm = topic
    .metricNumberOfNotificationsFailed()
    .createAlarm(stack, 'Alarm', { threshold: 1, evaluationPeriods: 1 });

  // WHEN
  monitoring.addHighSeverityAlarm('My Alarm', alarm);

  // a dashboard is automatically created
  Template.fromStack(stack).hasResourceProperties('AWS::CloudWatch::Alarm', {
    AlarmActions: ['arn:aws:sns:us-east-1:123456789012:high'],
    Dimensions: [
      {
        Name: 'TopicName',
        Value: { 'Fn::GetAtt': ['TopicBFC7AF6E', 'TopicName'] },
      },
    ],
  });

  Template.fromStack(stack).hasResourceProperties(
    'AWS::CloudWatch::Dashboard',
    {
      DashboardBody: {
        'Fn::Join': [
          '',
          [
            '{"widgets":[{"type":"metric","width":24,"height":6,"x":0,"y":0,"properties":{"view":"timeSeries","title":"My Alarm","region":"',
            { Ref: 'AWS::Region' },
            '","annotations":{"alarms":["',
            { 'Fn::GetAtt': ['Alarm7103F465', 'Arn'] },
            '"]},"yAxis":{}}}]}',
          ],
        ],
      },
    }
  );
});

test('monitoring exposes a list of high severity alarms', () => {
  // GIVEN
  const stack = new Stack();
  const topic = new sns.Topic(stack, 'Topic');
  const monitoring = new Monitoring(stack, 'Monitoring', {
    alarmActions: actions,
  });
  const alarm1 = topic
    .metricNumberOfNotificationsFailed()
    .createAlarm(stack, 'Alarm1', { threshold: 1, evaluationPeriods: 1 });
  const alarm2 = topic
    .metricSMSMonthToDateSpentUSD()
    .createAlarm(stack, 'Alarm2', { threshold: 100, evaluationPeriods: 1 });
  const alarm3 = topic
    .metricSMSMonthToDateSpentUSD()
    .createAlarm(stack, 'Alarm3', { threshold: 500, evaluationPeriods: 1 });

  // WHEN
  monitoring.addHighSeverityAlarm('My Alarm', alarm1);
  monitoring.addLowSeverityAlarm('My Other Alarm', alarm2);
  monitoring.addMediumSeverityAlarm('My Third Alarm', alarm3);

  expect(monitoring.highSeverityAlarms.map((alarm) => alarm.alarmArn)).toEqual([
    alarm1.alarmArn,
  ]);
  expect(monitoring.lowSeverityAlarms.map((alarm) => alarm.alarmArn)).toEqual([
    alarm2.alarmArn,
  ]);
  expect(
    monitoring.mediumSeverityAlarms.map((alarm) => alarm.alarmArn)
  ).toEqual([alarm3.alarmArn]);
});

test('web canaries can ping URLs and raise high severity alarms', () => {
  // GIVEN
  const stack = new Stack();
  const monitoring = new Monitoring(stack, 'Monitoring', {
    alarmActions: actions,
  });

  // WHEN
  monitoring.addWebCanary('Ping1', 'https://ping1');

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::CloudWatch::Alarm', {
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    EvaluationPeriods: 1,
    AlarmActions: ['arn:aws:sns:us-east-1:123456789012:high'],
    AlarmDescription: '80% error rate for https://ping1 (Ping1)',
    Metrics: [
      {
        Id: 'm1',
        Label: 'https://ping1 Errors',
        MetricStat: {
          Metric: {
            Dimensions: [
              {
                Name: 'FunctionName',
                Value: {
                  Ref: 'MonitoringWebCanaryPing1HttpGetFunction2403444A',
                },
              },
            ],
            MetricName: 'Errors',
            Namespace: 'AWS/Lambda',
          },
          Period: 300,
          Stat: 'Sum',
        },
        ReturnData: true,
      },
    ],
    Threshold: 4,
    TreatMissingData: 'breaching',
  });

  Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: {
        URL: 'https://ping1',
      },
    },
  });
});

test('normal-severity alarm actions are registered', () => {
  // GIVEN
  const stack = new Stack(undefined, 'TestStack');
  const alarm = new Alarm(stack, 'Alarm', {
    evaluationPeriods: 1,
    metric: new Metric({
      metricName: 'FakeMetricName',
      namespace: 'FakeNamespace',
    }),
    threshold: 0,
  });

  const normalSeverity = 'fake::arn::of::an::action';
  const normalSeverityActionArn = 'fake::arn::of::bound:alarm::action';
  const normalSeverityAction: IAlarmAction = {
    bind: () => ({ alarmActionArn: normalSeverityActionArn }),
  };

  // WHEN
  new Monitoring(stack, 'Monitoring', {
    alarmActions: { normalSeverity, normalSeverityAction },
  }).addLowSeverityAlarm('Alarm', alarm);

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::CloudWatch::Alarm', {
    AlarmActions: [normalSeverity, normalSeverityActionArn],
  });
});

test('high-severity alarm actions are registered', () => {
  // GIVEN
  const stack = new Stack(undefined, 'TestStack');
  const alarm = new Alarm(stack, 'Alarm', {
    evaluationPeriods: 1,
    metric: new Metric({
      metricName: 'FakeMetricName',
      namespace: 'FakeNamespace',
    }),
    threshold: 0,
  });

  const highSeverity = 'fake::arn::of::an::action';
  const highSeverityActionArn = 'fake::arn::of::bound:alarm::action';
  const highSeverityAction: IAlarmAction = {
    bind: () => ({ alarmActionArn: highSeverityActionArn }),
  };

  // WHEN
  new Monitoring(stack, 'Monitoring', {
    alarmActions: { highSeverity, highSeverityAction },
  }).addHighSeverityAlarm('Alarm', alarm);

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::CloudWatch::Alarm', {
    AlarmActions: [highSeverity, highSeverityActionArn],
  });
});

test('medium-severity alarm actions are registered', () => {
  // GIVEN
  const stack = new Stack(undefined, 'TestStack');
  const alarm = new Alarm(stack, 'Alarm', {
    evaluationPeriods: 1,
    metric: new Metric({
      metricName: 'FakeMetricName',
      namespace: 'FakeNamespace',
    }),
    threshold: 0,
  });

  const mediumSeverity = 'fake::arn::of::an::action';
  const mediumSeverityActionArn = 'fake::arn::of::bound:alarm::action';
  const mediumSeverityAction: IAlarmAction = {
    bind: () => ({ alarmActionArn: mediumSeverityActionArn }),
  };

  // WHEN
  new Monitoring(stack, 'Monitoring', {
    alarmActions: { mediumSeverity, mediumSeverityAction },
  }).addMediumSeverityAlarm('Alarm', alarm);

  // THEN
  Template.fromStack(stack).hasResourceProperties('AWS::CloudWatch::Alarm', {
    AlarmActions: [mediumSeverity, mediumSeverityActionArn],
  });
});
