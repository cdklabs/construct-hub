import { Duration } from 'aws-cdk-lib';
import {
  ComparisonOperator,
  Metric,
  MetricOptions,
  Statistic,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { IFunction, Tracing } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { lambdaFunctionUrl } from '../../deep-link';
import { Monitoring } from '../../monitoring';
import { RUNBOOK_URL } from '../../runbook-url';
import { CATALOG_KEY } from '../shared/constants';
import { MetricName, METRICS_NAMESPACE } from './constants';
import { PackageStats as Handler } from './package-stats';

/**
 * Props for `PackageStats`.
 */
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

  /**
   * How frequently should the stats be updated?
   *
   * NPM updates their download stats once a day.
   *
   * @default - 1 day
   */
  readonly updatePeriod?: Duration;

  /**
   * The key of the object storing the package stats.
   */
  readonly objectKey: string;
}

/**
 * Builds or re-builds the `stats.json` object in the designated bucket.
 */
export class PackageStats extends Construct {
  /**
   * The package store bucket, which should include both the
   * catalog and stats.
   */
  public readonly bucket: IBucket;

  /**
   * The Lambda function that periodically updates stats.json.
   */
  public readonly handler: IFunction;

  /**
   * The key of the object storing the package stats.
   */
  public readonly statsKey: string;

  public constructor(scope: Construct, id: string, props: PackageStatsProps) {
    super(scope, id);

    this.bucket = props.bucket;
    this.statsKey = props.objectKey;

    this.handler = new Handler(this, 'Default', {
      description: `Creates the stats.json object in ${props.bucket.bucketName}`,
      environment: {
        CATALOG_BUCKET_NAME: this.bucket.bucketName,
        CATALOG_OBJECT_KEY: CATALOG_KEY,
        STATS_BUCKET_NAME: this.bucket.bucketName,
        STATS_OBJECT_KEY: props.objectKey,
      },
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 256,
      reservedConcurrentExecutions: 1,
      timeout: Duration.minutes(15),
      tracing: Tracing.PASS_THROUGH,
    });

    const updatePeriod = props.updatePeriod ?? Duration.days(1);
    const rule = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.rate(updatePeriod),
    });
    rule.addTarget(new targets.LambdaFunction(this.handler));

    this.bucket.grantReadWrite(this.handler);

    const failureAlarm = this.handler
      .metricErrors()
      .createAlarm(scope, 'PackageStats/Failures', {
        alarmName: `${scope.node.path}/PackageStats/Failures`,
        alarmDescription: [
          'The package stats function failed!',
          '',
          `RunBook: ${RUNBOOK_URL}`,
          '',
          `Direct link to Lambda function: ${lambdaFunctionUrl(this.handler)}`,
        ].join('\n'),
        comparisonOperator:
          ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
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
      metricName: MetricName.REGISTERED_PACKAGES_WITH_STATS,
      namespace: METRICS_NAMESPACE,
    });
  }
}
