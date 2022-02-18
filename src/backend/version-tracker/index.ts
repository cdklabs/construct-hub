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
import { STORAGE_KEY_PREFIX, VERSION_TRACKER_KEY } from '../shared/constants';
import { ENV_PACKAGE_DATA_BUCKET_NAME, ENV_PACKAGE_DATA_KEY_PREFIX, ENV_VERSION_TRACKER_BUCKET_NAME, ENV_VERSION_TRACKER_OBJECT_KEY, MetricName, METRICS_NAMESPACE } from './constants';
import { VersionTracker as Handler } from './version-tracker';

/**
 * Props for `VersionTracker`.
 */
export interface VersionTrackerProps {
  /**
   * The package store bucket.
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
   * How frequently should the list of available versions be updated?
   *
   * @default - 1 minute
   */
  readonly updatePeriod?: Duration;
}

/**
 * Periodically updates the `all-versions.json` object in the designated bucket
 * with the list of all ingested package versions.
 */
export class VersionTracker extends Construct {
  /**
   * The package store bucket.
   */
  public readonly bucket: IBucket;

  /**
   * The Lambda function that periodically updates versions.json.
   */
  public readonly handler: IFunction;

  public constructor(scope: Construct, id: string, props: VersionTrackerProps) {
    super(scope, id);

    // the package data bucket is also used to store all-versions.json
    this.bucket = props.bucket;

    this.handler = new Handler(this, 'Default', {
      description: `[${this.node.path}] Creates the all-versions.json in ${props.bucket.bucketName}`,
      environment: {
        [ENV_PACKAGE_DATA_BUCKET_NAME]: this.bucket.bucketName,
        [ENV_PACKAGE_DATA_KEY_PREFIX]: STORAGE_KEY_PREFIX,
        [ENV_VERSION_TRACKER_BUCKET_NAME]: this.bucket.bucketName,
        [ENV_VERSION_TRACKER_OBJECT_KEY]: VERSION_TRACKER_KEY,
      },
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 10_240, // Currently the maximum possible setting
      reservedConcurrentExecutions: 1,
      timeout: Duration.minutes(1),
      tracing: Tracing.ACTIVE,
    });

    const grant = this.bucket.grantReadWrite(this.handler);

    const updatePeriod = props.updatePeriod ?? Duration.minutes(1);
    const event = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.rate(updatePeriod),
      targets: [new targets.LambdaFunction(this.handler)],
    });

    // ensure event does not trigger until Lambda permissions are set up
    event.node.addDependency(grant);

    const failureAlarm = this.handler.metricErrors().createAlarm(scope, 'VersionTracker/Failures', {
      alarmName: `${scope.node.path}/VersionTracker/Failures`,
      alarmDescription: [
        'The version tracker function failed!',
        '',
        `RunBook: ${RUNBOOK_URL}`,
        '',
        `Direct link to Lambda function: ${lambdaFunctionUrl(this.handler)}`,
      ].join('\n'),
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 3,
      threshold: 1,
      treatMissingData: TreatMissingData.MISSING,
    });
    props.monitoring.addLowSeverityAlarm('VersionTracker Failures', failureAlarm);

    const notRunningAlarm = this.handler.metricInvocations({ period: updatePeriod })
      .createAlarm(scope, 'VersionTracker/NotRunning', {
        alarmName: `${scope.node.path}/VersionTracker/NotRunning`,
        alarmDescription: [
          'The version tracker function is not running!',
          '',
          `RunBook: ${RUNBOOK_URL}`,
          '',
          `Direct link to Lambda function: ${lambdaFunctionUrl(this.handler)}`,
        ].join('\n'),
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 2,
        threshold: 1,
        treatMissingData: TreatMissingData.BREACHING,
      });
    props.monitoring.addLowSeverityAlarm('VersionTracker Not Running', notRunningAlarm);
  }

  public metricTrackedPackagesCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.TRACKED_PACKAGES_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricTrackedVersionsCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.TRACKED_VERSIONS_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }
}
