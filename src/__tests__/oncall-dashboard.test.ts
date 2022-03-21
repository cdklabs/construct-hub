import '@aws-cdk/assert/jest';
import { CloudFrontWebDistribution } from '@aws-cdk/aws-cloudfront';
import * as lambda from '@aws-cdk/aws-lambda';
import { Bucket } from '@aws-cdk/aws-s3';
import { Stack } from '@aws-cdk/core';

import { OnCallDashboard } from '../on-call-dashboard';

test('minimally it should create a dashboard with lambda SERVICE metrics', () => {
  const stack = new Stack();
  const lambdaServiceAlarmThreshold = 90;
  new OnCallDashboard(stack, 'OnCallDashboard', {
    lambdaServiceAlarmThreshold,
  });

  expect(stack).toHaveResource('AWS::CloudWatch::Dashboard', {
    DashboardName: 'OnCall',
  });

  expect(stack).toHaveResource('AWS::CloudWatch::Alarm', {
    ComparisonOperator: 'GreaterThanThreshold',
    EvaluationPeriods: 5,
    Metrics: [
      {
        Expression: 'mLambdaUsage / mLambdaQuota * 100',
        Id: 'expr_1',
        Label: 'Concurrent executions quota usage %',
      },
      {
        Id: 'mLambdaUsage',
        MetricStat: {
          Metric: {
            MetricName: 'ConcurrentExecutions',
            Namespace: 'AWS/Lambda',
          },
          Period: 300,
          Stat: 'Maximum',
        },
        ReturnData: false,
      },
      {
        Expression: 'SERVICE_QUOTA(mLambdaUsage)',
        Id: 'mLambdaQuota',
        ReturnData: false,
      },
    ],
    Threshold: 90,
    TreatMissingData: 'missing',

  });
});

test('adds lambda function to concurrent usage graph', () => {
  const stack = new Stack();

  const fn = new lambda.Function(stack, 'Fn', {
    code: lambda.Code.fromInline('const handler = () => {console.log("hello")};'),
    handler: 'handler',
    runtime: lambda.Runtime.NODEJS_14_X,
  });

  const dashboard = new OnCallDashboard(stack, 'OnCallDashboard');
  dashboard.addConcurrentExecutionMetricToOnCallDashboard(fn);

  expect(stack).toHaveResource('AWS::CloudWatch::Dashboard', {
    DashboardName: 'OnCall',
    DashboardBody: {
      'Fn::Join': [
        '',
        [
          '{"widgets":[{"type":"metric","width":12,"height":8,"x":0,"y":0,"properties":{"view":"timeSeries","title":"Lambda concurrent execution quota","region":"',
          {
            Ref: 'AWS::Region',
          },
          '","metrics":[["AWS/Lambda","ConcurrentExecutions",{"label":"Lambda Concurrent Executions","stat":"Maximum","id":"mLambdaUsage"}],["AWS/Lambda","Invocations","FunctionName","',
          {
            Ref: 'Fn9270CBC0',
          },
          '",{"label":"',
          {
            Ref: 'Fn9270CBC0',
          },
          '","stat":"Maximum","id":"m1"}],[{"label":"Concurrent executions quota usage %","expression":"mLambdaUsage / mLambdaQuota * 100","yAxis":"right"}],[{"expression":"SERVICE_QUOTA(mLambdaUsage)","visible":false,"id":"mLambdaQuota"}],[{"label":"',
          {
            Ref: 'Fn9270CBC0',
          },
          ' quota usage %","expression":"m1 / mLambdaQuota * 100","yAxis":"right"}],[{"expression":"SERVICE_QUOTA(mLambdaUsage)","visible":false,"id":"lambdaQuotaLimit"}]],"yAxis":{"left":{"label":"Concurrent execution count"},"right":{"label":"Quota Percent","min":0,"max":100}}}}]}',
        ],
      ],
    },
  });
});

test('It adds cloud front distribution to the dashboard when present', () => {
  const stack = new Stack();
  const bucket = new Bucket(stack, 'Bucket');
  const distribution = new CloudFrontWebDistribution(stack, 'Distribution', {
    originConfigs: [{
      behaviors: [{
        isDefaultBehavior: true,
      }],
      s3OriginSource: {
        s3BucketSource: bucket,
      },
    }],
  });
  const dashboard = new OnCallDashboard(stack, 'OnCallDashboard');
  dashboard.addDistributionMetricToOnCallDashboard(distribution);
  expect(stack).toHaveResource('AWS::CloudWatch::Dashboard', {
    DashboardName: 'OnCall',
    DashboardBody: {
      'Fn::Join': [
        '',
        [
          '{"widgets":[{"type":"metric","width":12,"height":8,"x":0,"y":0,"properties":{"view":"timeSeries","title":"Lambda concurrent execution quota","region":"',
          {
            Ref: 'AWS::Region',
          },
          '","metrics":[["AWS/Lambda","ConcurrentExecutions",{"label":"Lambda Concurrent Executions","stat":"Maximum","id":"mLambdaUsage"}],[{"label":"Concurrent executions quota usage %","expression":"mLambdaUsage / mLambdaQuota * 100","yAxis":"right"}],[{"expression":"SERVICE_QUOTA(mLambdaUsage)","visible":false,"id":"mLambdaQuota"}]],"yAxis":{"left":{"label":"Concurrent execution count"},"right":{"label":"Quota Percent","min":0,"max":100}}}},{"type":"metric","width":12,"height":8,"x":0,"y":8,"properties":{"view":"timeSeries","title":"CloudFront Metrics","region":"',
          {
            Ref: 'AWS::Region',
          },
          '","metrics":[["AWS/CloudFront","Requests","DistributionId","',
          {
            Ref: 'DistributionCFDistribution882A7313',
          },
          '","Region","Global",{"region":"us-east-1"}],["AWS/CloudFront","4xxErrorRate","DistributionId","',
          {
            Ref: 'DistributionCFDistribution882A7313',
          },
          '","Region","Global",{"region":"us-east-1","yAxis":"right"}],["AWS/CloudFront","5xxErrorRate","DistributionId","',
          {
            Ref: 'DistributionCFDistribution882A7313',
          },
          '","Region","Global",{"region":"us-east-1","yAxis":"right"}]],"yAxis":{"left":{"label":"Requests count"},"right":{"label":"Request Percent","min":0,"max":100}}}}]}',
        ],
      ],
    },

  });
});
