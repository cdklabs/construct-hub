import '@aws-cdk/assert/jest';
import { IAlarmAction, Alarm, Metric } from '@aws-cdk/aws-cloudwatch';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sns from '@aws-cdk/aws-sns';
import { Stack } from '@aws-cdk/core';
import { Monitoring } from '../monitoring';
import { handler as webCanaryHandler } from '../monitoring/http-get-function.lambda';

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
  expect(stack).toHaveResource('AWS::CloudWatch::Dashboard');
});

test('watchful can be used for setting up automatic monitoring', () => {
  // GIVEN
  const stack = new Stack();
  const fn = new lambda.Function(stack, 'Function', {
    runtime: lambda.Runtime.NODEJS_14_X,
    code: lambda.Code.fromInline('foo'),
    handler: 'index.handler',
  });
  const monitoring = new Monitoring(stack, 'Monitoring', {
    alarmActions: actions,
  });

  // WHEN
  monitoring.watchful.watchLambdaFunction('My Function', fn);

  // an alarm is automatically created for this function
  expect(stack).toHaveResource('AWS::CloudWatch::Alarm', {
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
  const alarm = topic.metricNumberOfNotificationsFailed().createAlarm(stack, 'Alarm', { threshold: 1, evaluationPeriods: 1 });

  // WHEN
  monitoring.addHighSeverityAlarm('My Alarm', alarm);

  // a dashboard is automatically created
  expect(stack).toHaveResource('AWS::CloudWatch::Alarm', {
    AlarmActions: ['arn:aws:sns:us-east-1:123456789012:high'],
    Dimensions: [{ Name: 'TopicName', Value: { 'Fn::GetAtt': ['TopicBFC7AF6E', 'TopicName'] } }],
  });

  expect(stack).toHaveResource('AWS::CloudWatch::Dashboard', {
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
  });
});

test('monitoring exposes a list of high severity alarms', () => {
  // GIVEN
  const stack = new Stack();
  const topic = new sns.Topic(stack, 'Topic');
  const monitoring = new Monitoring(stack, 'Monitoring', {
    alarmActions: actions,
  });
  const alarm1 = topic.metricNumberOfNotificationsFailed().createAlarm(stack, 'Alarm1', { threshold: 1, evaluationPeriods: 1 });
  const alarm2 = topic.metricSMSMonthToDateSpentUSD().createAlarm(stack, 'Alarm2', { threshold: 100, evaluationPeriods: 1 });

  // WHEN
  monitoring.addHighSeverityAlarm('My Alarm', alarm1);
  monitoring.addLowSeverityAlarm('My Other Alarm', alarm2);

  expect(monitoring.highSeverityAlarms.map((alarm) => alarm.alarmArn)).toEqual([alarm1.alarmArn]);
  expect(monitoring.lowSeverityAlarms.map((alarm) => alarm.alarmArn)).toEqual([alarm2.alarmArn]);
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
  expect(stack).toHaveResource('AWS::CloudWatch::Alarm', {
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    EvaluationPeriods: 1,
    AlarmActions: [
      'arn:aws:sns:us-east-1:123456789012:high',
    ],
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


  expect(stack).toHaveResource('AWS::Lambda::Function', {
    Environment: {
      Variables: {
        URL: 'https://ping1',
      },
    },
  });
});

describe('web canary handler', () => {
  test('web ping is successful', async () => {
    process.env.URL = 'https://amazon.com';
    await webCanaryHandler({});
  });

  test('web ping throws for a non-200 response', async () => {
    process.env.URL = 'https://amazon.com/not-found-please12345';
    await expect(webCanaryHandler({})).rejects.toThrow(/Response code 404 \(Not Found\)/);
  });
});

test('normal-severity alarm actions are registered', () => {
  // GIVEN
  const stack = new Stack(undefined, 'TestStack');
  const alarm = new Alarm(stack, 'Alarm', {
    evaluationPeriods: 1,
    metric: new Metric({ metricName: 'FakeMetricName', namespace: 'FakeNamespace' }),
    threshold: 0,
  });

  const normalSeverity = 'fake::arn::of::an::action';
  const normalSeverityActionArn = 'fake::arn::of::bound:alarm::action';
  const normalSeverityAction: IAlarmAction = { bind: () => ({ alarmActionArn: normalSeverityActionArn }) };

  // WHEN
  new Monitoring(stack, 'Monitoring', {
    alarmActions: { normalSeverity, normalSeverityAction },
  }).addLowSeverityAlarm('Alarm', alarm);

  // THEN
  expect(stack).toHaveResource('AWS::CloudWatch::Alarm', {
    AlarmActions: [normalSeverity, normalSeverityActionArn],
  });
});

test('high-severity alarm actions are registered', () => {
  // GIVEN
  const stack = new Stack(undefined, 'TestStack');
  const alarm = new Alarm(stack, 'Alarm', {
    evaluationPeriods: 1,
    metric: new Metric({ metricName: 'FakeMetricName', namespace: 'FakeNamespace' }),
    threshold: 0,
  });

  const highSeverity = 'fake::arn::of::an::action';
  const highSeverityActionArn = 'fake::arn::of::bound:alarm::action';
  const highSeverityAction: IAlarmAction = { bind: () => ({ alarmActionArn: highSeverityActionArn }) };

  // WHEN
  new Monitoring(stack, 'Monitoring', {
    alarmActions: { highSeverity, highSeverityAction },
  }).addHighSeverityAlarm('Alarm', alarm);

  // THEN
  expect(stack).toHaveResource('AWS::CloudWatch::Alarm', {
    AlarmActions: [highSeverity, highSeverityActionArn],
  });
});
