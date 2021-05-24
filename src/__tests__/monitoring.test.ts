import * as lambda from '@aws-cdk/aws-lambda';
import * as sns from '@aws-cdk/aws-sns';
import { Stack } from '@aws-cdk/core';
import { Monitoring } from '../monitoring';
import { handler as webCanaryHandler } from '../monitoring/http-get-function.lambda';
import '@aws-cdk/assert/jest';

const actions = {
  highSeverity: 'arn:aws:sns:us-east-1:123456789012:high',
  normalSeverity: 'arn:aws:sns:us-east-1:123456789012:normal',
};

test('minimal', () => {
  // GIVEN
  const stack = new Stack();

  // WHEN
  new Monitoring(stack, 'Monitoring', { alarmActions: actions });

  // a dashboard is automatically created
  expect(stack).toHaveResource('AWS::CloudWatch::Dashboard');
});

test('watchful can be used for setting up automatic monitoring', () => {
  // GIVEN
  const stack = new Stack();
  const fn = new lambda.Function(stack, 'Function', {
    runtime: lambda.Runtime.NODEJS_12_X,
    code: lambda.Code.fromInline('foo'),
    handler: 'index.handler',
  });
  const monitoring = new Monitoring(stack, 'Monitoring', { alarmActions: actions });

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
  const monitoring = new Monitoring(stack, 'Monitoring', { alarmActions: actions });

  // WHEN
  monitoring.addHighSeverityAlarm(topic.metricNumberOfNotificationsFailed().createAlarm(stack, 'Alarm', { threshold: 1, evaluationPeriods: 1 }));

  // a dashboard is automatically created
  expect(stack).toHaveResource('AWS::CloudWatch::Alarm', {
    AlarmActions: ['arn:aws:sns:us-east-1:123456789012:high'],
    Dimensions: [{ Name: 'TopicName', Value: { 'Fn::GetAtt': ['TopicBFC7AF6E', 'TopicName'] } }],
  });
});

test('web canaries can ping URLs and raise high severity alarms', () => {
  // GIVEN
  const stack = new Stack();
  const monitoring = new Monitoring(stack, 'Monitoring', { alarmActions: actions });

  // WHEN
  monitoring.addWebCanary('Ping1', 'https://ping1');

  // THEN
  expect(stack).toHaveResource('AWS::CloudWatch::Alarm', {
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    EvaluationPeriods: 1,
    AlarmActions: ['arn:aws:sns:us-east-1:123456789012:high'],
    AlarmDescription: '80% error rate for https://ping1 (Ping1)',
    Metrics: [
      {
        Id: 'm1',
        Label: 'Ping1',
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