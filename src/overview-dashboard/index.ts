import { IDistribution } from '@aws-cdk/aws-cloudfront';
import { ComparisonOperator, Dashboard, GraphWidget, MathExpression, Metric, Statistic, TreatMissingData } from '@aws-cdk/aws-cloudwatch';
import { IFunction } from '@aws-cdk/aws-lambda';
import { IQueue } from '@aws-cdk/aws-sqs';
import { Construct } from '@aws-cdk/core';
import { Inventory } from '../backend/inventory';
import { RUNBOOK_URL } from '../runbook-url';
import { IOverviewDashboard } from './api';
import { SQSDLQWidget } from './sqs-dlq-widget';

export interface OverviewDashboardProps {
  readonly lambdaServiceAlarmThreshold?: number;
  readonly dashboardName?: string;
}

/**
 * Construct hub overview
 *
 * This construct generates a dashboard to provide Overview of the Construct Hub operation
 * The dashboard includes details like DLQ, CloudFront errors and Lambda Service Quota
 *
 * Components should use the APIs of this module to add widgets to overview dashboard
 */
export class OverviewDashboard extends Construct implements IOverviewDashboard {
  private static mLambdaUsage: Metric = new Metric({
    metricName: 'ConcurrentExecutions',
    namespace: 'AWS/Lambda',
    statistic: Statistic.MAXIMUM,
  });

  private static mLambdaQuota: MathExpression = new MathExpression({
    expression: 'SERVICE_QUOTA(mLambdaUsage)',
    usingMetrics: { mLambdaUsage: OverviewDashboard.mLambdaUsage },
  });

  private readonly dashboard: Dashboard;

  private queueMetricWidget?: SQSDLQWidget;

  private cloudFrontMetricWidget?: GraphWidget;

  private readonly lambdaServiceLimitGraph: GraphWidget;

  private readonly lambdaServiceAlarmThreshold: number;


  private metricCount: number = 1;

  constructor(scope: Construct, id: string, props?: OverviewDashboardProps) {
    super(scope, id);
    this.lambdaServiceAlarmThreshold = props?.lambdaServiceAlarmThreshold ?? 70;
    this.dashboard = new Dashboard(this, 'Overview dashboard', { dashboardName: props?.dashboardName });
    this.lambdaServiceLimitGraph = this.addLambdaServiceQuotaWidgetToOnCallDashboard();
    this.dashboard.addWidgets(this.lambdaServiceLimitGraph);
  }

  /**
   * Adds a metric widget to the Overview dashboard showing the total number concurrent executions
    * of a Lambda function and the percentage of SERVICE_QUOTA utilized by the function. This can be
    * used to see which function has the most impact of the service quota.
   * @param fn Lambda function to be monitored
   */

  public addConcurrentExecutionMetricToOnCallDashboard(fn: IFunction, name?: string) {
    const metricName = `m${this.metricCount++}`;
    const invocationCount = fn.metricInvocations({
      statistic: Statistic.MAXIMUM,
      label: name ?? `${fn.functionName}`,
    });
    this.lambdaServiceLimitGraph.addRightMetric(new MathExpression({
      expression: `${metricName} / mLambdaQuota * 100`,
      usingMetrics: { [metricName]: invocationCount, lambdaQuotaLimit: OverviewDashboard.mLambdaQuota },
      label: `${name ?? fn.functionName} quota usage %`,
    }));
  }

  /**
   * Adds widgets to Overview dashboard with link to the dashboard and number of visible messages.
   * @param name of the DLQ that will be used in the dashboard
   * @param deadLetterQueue Dead Letter Queue to be used in the dashboard
   * @param reDriveFunction a lambda function that will be used to re-drive the DLQ
   */
  public addDLQMetricToDashboard(name: string, deadLetterQueue: IQueue, reDriveFunction?: IFunction) {
    if (!this.queueMetricWidget) {
      this.queueMetricWidget = this.queueMetricWidget = new SQSDLQWidget(this, 'QueueMetricWidget', {
        queues: [],
        key: 'QueueMetricWidget',
      });
      this.dashboard.addWidgets(this.queueMetricWidget);
    }
    this.queueMetricWidget.addQueue(name, deadLetterQueue, reDriveFunction);
  }

  /**
   *  Adds a widget to the Overview dashboard showing the number of requests to CloudFront
   */

  public addDistributionMetricToDashboard(distribution: IDistribution) {
    if (!this.cloudFrontMetricWidget) {
      this.cloudFrontMetricWidget = this.addCloudFrontMetricWidget();
      this.dashboard.addWidgets(this.cloudFrontMetricWidget);
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
      usingMetrics: { mLambdaUsage: OverviewDashboard.mLambdaUsage, mLambdaQuota: OverviewDashboard.mLambdaQuota },
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
      right: [
        alarm.metric,
      ],
      rightYAxis: { label: 'Quota Percent', min: 0, max: 100 },
      rightAnnotations: [{
        value: this.lambdaServiceAlarmThreshold,
      }],
    });

    return lambdaServiceQuotaWidget;
  }

  public addInventoryMetrics(inventory: Inventory) {
    this.dashboard.addWidgets(new GraphWidget({
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