import { ComparisonOperator, Metric, MetricOptions, Statistic, TreatMissingData } from '@aws-cdk/aws-cloudwatch';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import { IFunction, Tracing } from '@aws-cdk/aws-lambda';
import { RetentionDays } from '@aws-cdk/aws-logs';
import type { IBucket } from '@aws-cdk/aws-s3';
import { Construct, Duration } from '@aws-cdk/core';
import { lambdaFunctionUrl } from '../../deep-link';
import { Monitoring } from '../../monitoring';
import { RUNBOOK_URL } from '../../runbook-url';
import { MetricName, METRICS_NAMESPACE } from './constants';
import { PackageStats as Handler } from './package-stats';

export interface PackageStatsProps {
  /**
   * The package store bucket, which should include both the
   * catalog and stats.
   */
  readonly bucket: IBucket;

  /**
   * The monitoring handler to register alarms with.
   */
  readonly monitoring: Monitoring;

  /**
   * How long should execution logs be retained?
   *
   * @default RetentionDays.TEN_YEARS
   */
  readonly logRetention?: RetentionDays;
}

/**
 * Builds or re-builds the `stats.json` object in the designated bucket.
 */
export class PackageStats extends Construct {
  public readonly bucket: IBucket;
  public readonly function: IFunction;

  public constructor(scope: Construct, id: string, props: PackageStatsProps) {
    super(scope, id);

    this.bucket = props.bucket;

    this.function = new Handler(this, 'Default', {
      description: `Creates the stats.json object in ${props.bucket.bucketName}`,
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
      },
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 256,
      reservedConcurrentExecutions: 1,
      timeout: Duration.minutes(15),
      tracing: Tracing.PASS_THROUGH,
    });

    const rule = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.cron({ hour: '6', minute: '0' }), // daily at 6am in some timezone
    });
    rule.addTarget(new targets.LambdaFunction(this.function));

    this.bucket.grantReadWrite(this.function);

    const failureAlarm = this.function.metricErrors().createAlarm(scope, 'PackageStats/Failures', {
      alarmName: `${scope.node.path}/PackageStats/Failures`,
      alarmDescription: [
        'The package stats function failed!',
        '',
        `RunBook: ${RUNBOOK_URL}`,
        '',
        `Direct link to Lambda function: ${lambdaFunctionUrl(this.function)}`,
      ].join('\n'),
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      threshold: 1,
      treatMissingData: TreatMissingData.MISSING,
    });
    props.monitoring.addLowSeverityAlarm('PackageStats Failures', failureAlarm);
  }

  public metricPackagesCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        ['ServiceName']: this.function.functionName,
        ['LogGroup']: this.function.functionName,
        ['ServiceType']: 'AWS::Lambda::Function',
      },
      metricName: MetricName.REGISTERED_PACKAGES_WITH_STATS,
      namespace: METRICS_NAMESPACE,
    });
  }
}
