import { IDistribution } from '@aws-cdk/aws-cloudfront';
import { ComparisonOperator, Dashboard, GraphWidget, MathExpression, Metric, Statistic, TreatMissingData } from '@aws-cdk/aws-cloudwatch';
import { IFunction } from '@aws-cdk/aws-lambda';
import { IQueue } from '@aws-cdk/aws-sqs';
import { Construct } from '@aws-cdk/core';
import { Inventory } from '../backend/inventory';
import { } from '../metric-utils';
import { RUNBOOK_URL } from '../runbook-url';
import { IOnCallDashboard } from './api';
import { SQSDLQWidget } from './sqs-dlq-widget';

export interface OnCallDashboardProps {
  lambdaServiceAlarmThreshold?: number;
}

export class OnCallDashboard extends Construct implements IOnCallDashboard {
  private readonly onCallDashboard: Dashboard;

  private queueMetricWidget?: SQSDLQWidget;

  private cloudFrontMetricWidget?: GraphWidget;

  private readonly lambdaServiceLimitGraph: GraphWidget;

  private readonly lambdaServiceAlarmThreshold: number;

  private mLambdaUsage: Metric = new Metric({
    metricName: 'ConcurrentExecutions',
    namespace: 'AWS/Lambda',
    statistic: Statistic.MAXIMUM,
  });

  private mLambdaQuota: MathExpression = new MathExpression({
    expression: 'SERVICE_QUOTA(mLambdaUsage)',
    usingMetrics: { mLambdaUsage: this.mLambdaUsage },
  });

  private metricCount: number = 1;

  constructor(scope: Construct, id: string, props?: OnCallDashboardProps) {
    super(scope, id);
    this.lambdaServiceAlarmThreshold = props?.lambdaServiceAlarmThreshold ?? 70;
    this.onCallDashboard = new Dashboard(this, 'On-Call dashboard', { dashboardName: 'OnCall' });
    this.lambdaServiceLimitGraph = this.addLambdaServiceQuotaWidgetToOnCallDashboard();
    this.onCallDashboard.addWidgets( this.lambdaServiceLimitGraph);
  }

  /**
   * Adds a metric widget to the on-call dashboard showing the total number concurrent executions
    * of a Lambda function and the percentage of SERVICE_QUOTA utilized by the function. This can be
    * used to see which function has the most impact of the service quota.
   * @param fn Lambda function to be monitored
   */

  public addConcurrentExecutionMetricToOnCallDashboard(fn: IFunction) {
    const metricName = `m${this.metricCount++}`;
    const invocationCount = fn.metricInvocations({
      statistic: Statistic.MAXIMUM,

      label: `${fn.functionName}`,
    });
    this.lambdaServiceLimitGraph.addLeftMetric(invocationCount);
    this.lambdaServiceLimitGraph.addRightMetric(new MathExpression({
      expression: `${metricName} / mLambdaQuota * 100`,
      usingMetrics: { [metricName]: invocationCount, lambdaQuotaLimit: this.mLambdaQuota },
      label: `${fn.functionName} quota usage %`,
    }));
  }
  /**
   * Adds widgets to on-call dashboard with link to the dashboard and number of visible messages.
   * @param name of the DLQ that will be used in the dashboard
   * @param deadLetterQueue Dead Letter Queue to be used in the dashboard
   * @param reDriveFunction a lambda function that will be used to re-drive the DLQ
   */
  public addDLQMetricToOnCallDashboard(name: string, deadLetterQueue: IQueue, reDriveFunction?: IFunction) {
    if (!this.queueMetricWidget) {
      this.queueMetricWidget = this.queueMetricWidget = new SQSDLQWidget(this, 'QueueMetricWidget', {
        queues: [],
        key: 'QueueMetricWidget',
      });
      this.onCallDashboard.addWidgets(this.queueMetricWidget);
    }
    this.queueMetricWidget.addQueue(name, deadLetterQueue, reDriveFunction);
  }

  /**
   *  Adds a widget to the on-call dashboard showing the number of requests to CloudFront
   */

  public addDistributionMetricToOnCallDashboard(distribution: IDistribution) {
    if (!this.cloudFrontMetricWidget) {
      this.cloudFrontMetricWidget = this.addCloudFrontMetricWidget();
      this.onCallDashboard.addWidgets(this.cloudFrontMetricWidget);
    }

    const totalRequest = new Metric({
      metricName: 'Requests',
      namespace: 'AWS/CloudFront',
      statistic: Statistic.AVERAGE,
      dimensionsMap: {
        DistributionId: distribution.distributionId,
        Region: 'Global',
      },
      region: 'us-east-1', // global metric
    });

    const errorRate4xx = new Metric({
      metricName: '4xxErrorRate',
      namespace: 'AWS/CloudFront',
      statistic: Statistic.AVERAGE,
      dimensionsMap: {
        DistributionId: distribution.distributionId,
        Region: 'Global',
      },
      region: 'us-east-1', // global metric
    });

    const errorRate5xx = new Metric({
      metricName: '5xxErrorRate',
      namespace: 'AWS/CloudFront',
      statistic: Statistic.AVERAGE,
      dimensionsMap: {
        DistributionId: distribution.distributionId,
        Region: 'Global',
      },
      region: 'us-east-1', // global metric
    });

    this.cloudFrontMetricWidget.addLeftMetric(totalRequest);
    this.cloudFrontMetricWidget.addRightMetric(errorRate4xx);
    this.cloudFrontMetricWidget.addRightMetric(errorRate5xx);
  }

  private addCloudFrontMetricWidget() {
    const widget = new GraphWidget({
      title: 'CloudFront Metrics',
      height: 8,
      width: 12,
      leftYAxis: { label: 'Requests count' },
      rightYAxis: { label: 'Request Percent', min: 0, max: 100 },
    });
    return widget;
  }

  private addLambdaServiceQuotaWidgetToOnCallDashboard() {
    const serviceQuotaLimit = new MathExpression({
      expression: 'mLambdaUsage / mLambdaQuota * 100',
      label: 'Concurrent executions quota usage %',
      usingMetrics: { mLambdaUsage: this.mLambdaUsage, mLambdaQuota: this.mLambdaQuota },
    });

    const alarm = serviceQuotaLimit.createAlarm(this, 'OnCallDashboard/lambdaServiceQuota', {
      alarmDescription: [
        `Lambda concurrent execution exceeded ${this.lambdaServiceAlarmThreshold}% of SERVICE_QUOTA`,
        '',
        `RunBook: ${RUNBOOK_URL}`,
        '',
        'Request a service quota increase for lambda functions',
      ].join('\n'),
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 5,
      threshold: this.lambdaServiceAlarmThreshold,
      treatMissingData: TreatMissingData.MISSING,
    });

    const lambdaServiceQuotaWidget = new GraphWidget({
      title: 'Lambda concurrent execution quota',
      height: 8,
      width: 12,
      left: [
        this.mLambdaUsage.with({ label: 'Lambda Concurrent Executions' }),
      ],
      leftYAxis: { label: 'Concurrent execution count' },
      right: [
        alarm.metric,
      ],
      rightYAxis: { label: 'Quota Percent', min: 0, max: 100 },
    });

    return lambdaServiceQuotaWidget;
  }

  public addInventoryMetrics(inventory: Inventory) {
    this.onCallDashboard.addWidgets(new GraphWidget({
      title: 'Construct Hub Inventory',
      height: 8,
      width: 12,
      left: [
        inventory.metricPackageCount(),
        inventory.metricPackageMajorCount(),
      ],
      leftYAxis: { label: 'Package count' },
    }));
  }
}