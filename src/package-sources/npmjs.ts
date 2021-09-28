import { ComparisonOperator, GraphWidget, Metric, MetricOptions, Statistic, TreatMissingData } from '@aws-cdk/aws-cloudwatch';
import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { Tracing } from '@aws-cdk/aws-lambda';
import { BlockPublicAccess, Bucket, IBucket } from '@aws-cdk/aws-s3';
import { Construct, Duration } from '@aws-cdk/core';
import { lambdaFunctionUrl, s3ObjectUrl } from '../deep-link';
import { fillMetric } from '../metric-utils';
import type { IPackageSource, PackageSourceBindOptions, PackageSourceBindResult } from '../package-source';
import { RUNBOOK_URL } from '../runbook-url';
import { MARKER_FILE_NAME, METRICS_NAMESPACE, MetricName, S3KeyPrefix } from './npmjs/constants.lambda-shared';

import { NpmJsFollower } from './npmjs/npm-js-follower';

export interface NpmJsProps {
  /**
   * The bucket to use for staging npm packages.
   *
   * @default - a new bucket will be created.
   */
  readonly stagingBucket?: IBucket;
}

/**
 * A package source that gets package data from the npmjs.com package registry.
 */
export class NpmJs implements IPackageSource {
  public constructor(private readonly props: NpmJsProps = {}) {}

  public bind(
    scope: Construct,
    { denyList, ingestion, licenseList, monitoring, queue, repository }: PackageSourceBindOptions,
  ): PackageSourceBindResult {
    repository?.addExternalConnection('public:npmjs');

    const bucket = this.props.stagingBucket || new Bucket(scope, 'NpmJs/StagingBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [{ prefix: S3KeyPrefix.STAGED_KEY_PREFIX, expiration: Duration.days(30) }],
    });
    bucket.grantRead(ingestion);

    const follower = new NpmJsFollower(scope, 'NpmJs', {
      description: `[${scope.node.path}/NpmJs] Periodically query npmjs.com index for new packages`,
      environment: {
        AWS_EMF_ENVIRONMENT: 'Local',
        BUCKET_NAME: bucket.bucketName,
        QUEUE_URL: queue.queueUrl,
      },
      memorySize: 10_024, // 10 GiB
      reservedConcurrentExecutions: 1, // Only one execution at a time, to avoid race conditions on the S3 marker object
      timeout: Duration.minutes(5),
      tracing: Tracing.ACTIVE,
    });

    bucket.grantReadWrite(follower);
    queue.grantSendMessages(follower);
    denyList?.grantRead(follower);
    licenseList.grantRead(follower);

    const rule = new Rule(scope, 'NpmJs/Schedule', {
      description: `${scope.node.path}/NpmJs/Schedule`,
      schedule: Schedule.rate(Duration.minutes(5)),
      targets: [new LambdaFunction(follower)],
    });

    const failureAlarm = follower.metricErrors().createAlarm(scope, 'NpmJs/Follower/Failures', {
      alarmName: `${scope.node.path}/NpmJs/Follower/Failures`,
      alarmDescription: [
        'The NpmJs follower function failed!',
        '',
        `RunBook: ${RUNBOOK_URL}`,
        '',
        `Direct link to Lambda function: ${lambdaFunctionUrl(follower)}`,
      ].join('\n'),
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 3,
      threshold: 1,
      treatMissingData: TreatMissingData.MISSING,
    });
    monitoring.addHighSeverityAlarm('NpmJs/Follower Failures', failureAlarm);

    const notRunningAlarm = follower.metricInvocations().createAlarm(scope, 'NpmJs/Follower/NotRunning', {
      alarmName: `${scope.node.path}/NpmJs/Follower/NotRunning`,
      alarmDescription: [
        'The NpmJs follower function is not running!',
        '',
        `RunBook: ${RUNBOOK_URL}`,
        '',
        `Direct link to Lambda function: ${lambdaFunctionUrl(follower)}`,
      ].join('\n'),
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
      threshold: 1,
      treatMissingData: TreatMissingData.BREACHING,
    });
    monitoring.addHighSeverityAlarm('NpmJs/Follower Not Running', notRunningAlarm);

    const noChangeAlarm = this.metricChangeCount().createAlarm(scope, 'NpmJs/Follower/NoChanges', {
      alarmName: `${scope.node.path}/NpmJs/Follower/NoChanges`,
      alarmDescription: [
        'The NpmJs follower function is no discovering any changes from CouchDB!',
        '',
        `RunBook: ${RUNBOOK_URL}`,
        '',
        `Direct link to Lambda function: ${lambdaFunctionUrl(follower)}`,
      ].join('\n'),
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
      threshold: 1,
      // If the metric is not emitted, it can be assumed to be zero.
      treatMissingData: TreatMissingData.BREACHING,
    });
    monitoring.addLowSeverityAlarm('Np npmjs.com changes discovered', noChangeAlarm);

    // Finally - the "not running" alarm depends on the schedule (it won't run until the schedule
    // exists!), and the schedule depends on the failure alarm existing (we don't want it to run
    // before we can know it is failing). This means the returned `IDependable` effectively ensures
    // all alarms have been provisionned already! Isn't it nice!
    notRunningAlarm.node.addDependency(rule);
    rule.node.addDependency(failureAlarm);

    return {
      name: follower.node.path,
      links: [
        { name: 'NpmJs Follower', url: lambdaFunctionUrl(follower), primary: true },
        { name: 'Marker Object', url: s3ObjectUrl(bucket, MARKER_FILE_NAME) },
      ],
      dashboardWidgets: [
        [
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Function Health',
            left: [
              fillMetric(follower.metricInvocations({ label: 'Invocations' })),
              fillMetric(follower.metricErrors({ label: 'Errors' })),
            ],
            leftYAxis: { min: 0 },
            right: [
              this.metricRemainingTime({ label: 'Remaining Time' }),
            ],
            rightYAxis: { min: 0 },
            period: Duration.minutes(15),
          }),
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'CouchDB Follower',
            left: [
              this.metricChangeCount({ label: 'Change Count' }),
              this.metricUnprocessableEntity({ label: 'Unprocessable' }),
            ],
            leftYAxis: { min: 0 },
            right: [
              fillMetric(this.metricNpmJsChangeAge({ label: 'Lag to npmjs.com' }), 'REPEAT'),
              fillMetric(this.metricPackageVersionAge({ label: 'Package Version Age' }), 'REPEAT'),
            ],
            rightYAxis: { label: 'Milliseconds', min: 0, showUnits: false },
            period: Duration.minutes(15),
          }),
        ], [
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'CouchDB Changes',
            left: [
              this.metricLastSeq({ label: 'Last Sequence Number' }),
            ],
            period: Duration.minutes(15),
          }),
        ],
      ],
    };
  }

  /**
   * The average time it took to process a changes batch.
   */
  public metricBatchProcessingTime(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.AVERAGE,
      ...opts,
      metricName: MetricName.BATCH_PROCESSING_TIME,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The total count of changes that were processed.
   */
  public metricChangeCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.CHANGE_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The last sequence number that was processed. This metric can be used to
   * discover when a sequence reset has happened in the CouchDB instance.
   */
  public metricLastSeq(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.LAST_SEQ,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricNpmJsChangeAge(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MINIMUM,
      ...opts,
      metricName: MetricName.NPMJS_CHANGE_AGE,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The age of the oldest package version that was processed.
   */
  public metricPackageVersionAge(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.PACKAGE_VERSION_AGE,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The total count of package versions that were inspected.
   */
  public metricPackageVersionCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.PACKAGE_VERSION_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The total count of package versions that were deemed relevant.
   */
  public metricRelevantPackageVersions(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.RELEVANT_PACKAGE_VERSIONS,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The amount of time that was remaining when the lambda returned in order to
   * avoid hitting a timeout.
   */
  public metricRemainingTime(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.AVERAGE,
      ...opts,
      metricName: MetricName.REMAINING_TIME,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The total count of staging failures.
   */
  public metricStagingFailureCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.STAGING_FAILURE_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The average time it took to stage a package to S3.
   */
  public metricStagingTime(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.AVERAGE,
      ...opts,
      metricName: MetricName.STAGING_TIME,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The amount of changes that were not processed due to having an invalid
   * format.
   */
  public metricUnprocessableEntity(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.UNPROCESSABLE_ENTITY,
      namespace: METRICS_NAMESPACE,
    });
  }
}
