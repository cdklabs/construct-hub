import {
  ComparisonOperator,
  GraphWidget,
  MathExpression,
  Metric,
  MetricOptions,
  Statistic,
  TreatMissingData,
  IWidget,
} from '@aws-cdk/aws-cloudwatch';
import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { Tracing } from '@aws-cdk/aws-lambda';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { BlockPublicAccess, IBucket } from '@aws-cdk/aws-s3';
import { Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { Construct, Duration } from '@aws-cdk/core';
import { lambdaFunctionUrl, s3ObjectUrl, sqsQueueUrl } from '../deep-link';
import { fillMetric } from '../metric-utils';
import { IMonitoring } from '../monitoring/api';
import type {
  IPackageSource,
  PackageSourceBindOptions,
  PackageSourceBindResult,
} from '../package-source';
import { RUNBOOK_URL } from '../runbook-url';
import { S3StorageFactory } from '../s3/storage';
import { NpmJsPackageCanary } from './npmjs/canary';
import {
  MARKER_FILE_NAME,
  METRICS_NAMESPACE,
  MetricName,
  S3KeyPrefix,
} from './npmjs/constants.lambda-shared';

import { NpmJsFollower } from './npmjs/npm-js-follower';
import { StageAndNotify } from './npmjs/stage-and-notify';

/**
 * The periodicity at which the NpmJs follower will run. This MUST be a valid
 * CloudWatch Metric grain, as this will also be the period of the CloudWatch
 * alarm that montiors the health of the follower.
 */
const FOLLOWER_RUN_RATE = Duration.minutes(5);

/**
 * Alarm if we haven't seen changes over this time
 *
 * The CouchDB leader occasionally just starts tossing out timeouts and they
 * may last for a good while. We need to be conservative with our alarms
 * otherwise we're just going to be too spammy.
 */
const NO_CHANGES_ALARM_DURATION = Duration.hours(1);

export interface NpmJsProps {
  /**
   * The bucket to use for staging npm packages.
   *
   * @default - a new bucket will be created.
   */
  readonly stagingBucket?: IBucket;

  /**
   * Registers a package canary, which will track availability of a canary
   * package in ConstructHub, and emit dedicated metrics.
   *
   * @default true
   */
  readonly enableCanary?: boolean;

  /**
   * The package that is monitored by the package canary, if enabled by
   * `enableCanary`.
   *
   * @default 'construct-hub-probe'
   */
  readonly canaryPackage?: string;

  /**
   * The maximum amount of time it is supposed to take for packages to become
   * visible in this ConstructHub instance. If `enableCanary` is enabled, an
   * alarm will trigger if this SLA is breached by the `canaryPackage`.
   *
   * @default Duration.minutes(5)
   */
  readonly canarySla?: Duration;
}

/**
 * A package source that gets package data from the npmjs.com package registry.
 */
export class NpmJs implements IPackageSource {
  public constructor(private readonly props: NpmJsProps = {}) {}

  public bind(
    scope: Construct,
    {
      baseUrl,
      denyList,
      ingestion,
      licenseList,
      monitoring,
      queue,
      repository,
      overviewDashboard,
    }: PackageSourceBindOptions
  ): PackageSourceBindResult {
    repository?.addExternalConnection('public:npmjs');

    const storageFactory = S3StorageFactory.getOrCreate(scope);
    const bucket =
      this.props.stagingBucket ||
      storageFactory.newBucket(scope, 'NpmJs/StagingBucket', {
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        lifecycleRules: [
          {
            prefix: S3KeyPrefix.STAGED_KEY_PREFIX,
            expiration: Duration.days(30),
          },
        ],
      });
    bucket.grantRead(ingestion);

    const stager = new StageAndNotify(scope, 'NpmJs-StageAndNotify', {
      deadLetterQueue: new Queue(scope, 'StagerDLQ', {
        encryption: QueueEncryption.KMS_MANAGED,
        retentionPeriod: Duration.days(14),
        visibilityTimeout: Duration.minutes(15),
      }),
      description: `[${scope.node.path}/NpmJS-StageAndNotify] Stages tarballs to S3 and notifies ConstructHub`,
      environment: {
        AWS_EMF_ENVIRONMENT: 'Local',
        BUCKET_NAME: bucket.bucketName,
        QUEUE_URL: queue.queueUrl,
      },
      memorySize: 10_024, // 10GiB
      retryAttempts: 2,
      timeout: Duration.minutes(5),
      tracing: Tracing.ACTIVE,
    });

    bucket.grantReadWrite(stager);
    denyList?.grantRead(stager);
    queue.grantSendMessages(stager);

    stager.addEventSource(
      new SqsEventSource(stager.deadLetterQueue!, {
        batchSize: 1,
        enabled: false,
      })
    );

    const follower = new NpmJsFollower(scope, 'NpmJs', {
      description: `[${scope.node.path}/NpmJs] Periodically query npmjs.com index for new packages`,
      environment: {
        AWS_EMF_ENVIRONMENT: 'Local',
        BUCKET_NAME: bucket.bucketName,
        FUNCTION_NAME: stager.functionName,
      },
      memorySize: 10_024, // 10 GiB
      reservedConcurrentExecutions: 1, // Only one execution at a time, to avoid race conditions on the S3 marker object
      timeout: FOLLOWER_RUN_RATE,
      tracing: Tracing.ACTIVE,
    });

    bucket.grantReadWrite(follower, MARKER_FILE_NAME);
    denyList?.grantRead(follower);
    licenseList.grantRead(follower);
    stager.grantInvoke(follower);

    const rule = new Rule(scope, 'NpmJs/Schedule', {
      description: `${scope.node.path}/NpmJs/Schedule`,
      schedule: Schedule.rate(FOLLOWER_RUN_RATE),
      targets: [new LambdaFunction(follower)],
    });

    this.registerAlarms(scope, follower, stager, monitoring, rule);

    stager.deadLetterQueue &&
      overviewDashboard.addDLQMetricToDashboard(
        'NPM JS Stager DLQ',
        stager.deadLetterQueue
      );
    follower.deadLetterQueue &&
      overviewDashboard.addDLQMetricToDashboard(
        'NPM JS Follower DLQ',
        follower.deadLetterQueue
      );
    overviewDashboard.addConcurrentExecutionMetricToDashboard(
      follower,
      'NpmJsLambda'
    );
    overviewDashboard.addConcurrentExecutionMetricToDashboard(
      stager,
      'NpmJs-StageAndNotifyLambda'
    );

    return {
      name: follower.node.path,
      links: [
        {
          name: 'NpmJs Follower',
          url: lambdaFunctionUrl(follower),
          primary: true,
        },
        { name: 'Marker Object', url: s3ObjectUrl(bucket, MARKER_FILE_NAME) },
        { name: 'Stager', url: lambdaFunctionUrl(stager) },
        { name: 'Stager DLQ', url: sqsQueueUrl(stager.deadLetterQueue!) },
      ],
      dashboardWidgets: [
        [
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Follower Health',
            left: [
              fillMetric(follower.metricInvocations({ label: 'Invocations' })),
              fillMetric(follower.metricErrors({ label: 'Errors' })),
            ],
            leftYAxis: { min: 0 },
            right: [this.metricRemainingTime({ label: 'Remaining Time' })],
            rightYAxis: { min: 0 },
            period: Duration.minutes(5),
          }),
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Stager Health',
            left: [
              fillMetric(stager.metricInvocations({ label: 'Invocations' })),
              fillMetric(stager.metricErrors({ label: 'Errors' })),
            ],
            leftYAxis: { min: 0 },
            right: [stager.metricDuration({ label: 'Duration' })],
            rightYAxis: { min: 0 },
            period: Duration.minutes(5),
          }),
        ],
        [
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'CouchDB Follower',
            left: [
              fillMetric(this.metricChangeCount({ label: 'Change Count' }), 0),
              fillMetric(
                this.metricUnprocessableEntity({ label: 'Unprocessable' }),
                0
              ),
            ],
            leftYAxis: { min: 0 },
            right: [
              fillMetric(
                this.metricNpmJsChangeAge({ label: 'Lag to npmjs.com' }),
                'REPEAT'
              ),
              fillMetric(
                this.metricPackageVersionAge({ label: 'Package Version Age' }),
                'REPEAT'
              ),
            ],
            rightYAxis: { label: 'Milliseconds', min: 0, showUnits: false },
            period: Duration.minutes(5),
          }),
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'CouchDB Changes',
            left: [
              fillMetric(
                this.metricLastSeq({ label: 'Last Sequence Number' }),
                'REPEAT'
              ),
            ],
            period: Duration.minutes(5),
          }),
        ],
        [
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Stager Dead-Letter Queue',
            left: [
              fillMetric(
                stager.deadLetterQueue!.metricApproximateNumberOfMessagesVisible(
                  { label: 'Visible Messages' }
                ),
                0
              ),
              fillMetric(
                stager.deadLetterQueue!.metricApproximateNumberOfMessagesNotVisible(
                  { label: 'Invisible Messages' }
                ),
                0
              ),
            ],
            leftYAxis: { min: 0 },
            right: [
              stager.deadLetterQueue!.metricApproximateAgeOfOldestMessage({
                label: 'Oldest Message',
              }),
            ],
            rightYAxis: { min: 0 },
            period: Duration.minutes(1),
          }),
          ...(this.props.enableCanary ?? true
            ? this.registerCanary(
                follower,
                this.props.canaryPackage ?? 'construct-hub-probe',
                this.props.canarySla ?? Duration.minutes(5),
                bucket,
                baseUrl,
                monitoring
              )
            : []),
        ],
      ],
    };
  }

  /**
   * The average time it took to process a changes batch.
   */
  public metricBatchProcessingTime(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(1),
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
      period: Duration.minutes(1),
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
      period: Duration.minutes(1),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.LAST_SEQ,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricNpmJsChangeAge(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(1),
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
      period: Duration.minutes(1),
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
      period: Duration.minutes(1),
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
      period: Duration.minutes(1),
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
      statistic: Statistic.MINIMUM,
      ...opts,
      metricName: MetricName.REMAINING_TIME,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The amount of changes that were not processed due to having an invalid
   * format.
   */
  public metricUnprocessableEntity(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(1),
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.UNPROCESSABLE_ENTITY,
      namespace: METRICS_NAMESPACE,
    });
  }

  private registerAlarms(
    scope: Construct,
    follower: NpmJsFollower,
    stager: StageAndNotify,
    monitoring: IMonitoring,
    schedule: Rule
  ) {
    const failureAlarm = follower
      .metricErrors()
      .createAlarm(scope, 'NpmJs/Follower/Failures', {
        alarmName: `${scope.node.path}/NpmJs/Follower/Failures`,
        alarmDescription: [
          'The NpmJs follower function failed!',
          '',
          `RunBook: ${RUNBOOK_URL}`,
          '',
          `Direct link to Lambda function: ${lambdaFunctionUrl(follower)}`,
        ].join('\n'),
        comparisonOperator:
          ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 3,
        threshold: 1,
        treatMissingData: TreatMissingData.MISSING,
      });
    monitoring.addHighSeverityAlarm('NpmJs/Follower Failures', failureAlarm);

    const notRunningAlarm = follower
      .metricInvocations({ period: FOLLOWER_RUN_RATE })
      .createAlarm(scope, 'NpmJs/Follower/NotRunning', {
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
    monitoring.addHighSeverityAlarm(
      'NpmJs/Follower Not Running',
      notRunningAlarm
    );

    // The period for this alarm needs to match the scheduling interval of the
    // follower, otherwise the metric will be too sparse to properly detect
    // problems.
    const noChangeAlarm = this.metricChangeCount({
      period: FOLLOWER_RUN_RATE,
    }).createAlarm(scope, 'NpmJs/Follower/NoChanges', {
      alarmName: `${scope.node.path}/NpmJs/Follower/NoChanges`,
      alarmDescription: [
        'The NpmJs follower function is not discovering any changes from CouchDB!',
        '',
        `RunBook: ${RUNBOOK_URL}`,
        '',
        `Direct link to Lambda function: ${lambdaFunctionUrl(follower)}`,
      ].join('\n'),
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: howOften(FOLLOWER_RUN_RATE, NO_CHANGES_ALARM_DURATION),
      threshold: 1,
      // If the metric is not emitted, it can be assumed to be zero.
      treatMissingData: TreatMissingData.BREACHING,
    });
    monitoring.addLowSeverityAlarm(
      'Np npmjs.com changes discovered',
      noChangeAlarm
    );

    const dlqNotEmptyAlarm = new MathExpression({
      expression: 'mVisible + mHidden',
      usingMetrics: {
        mVisible:
          stager.deadLetterQueue!.metricApproximateNumberOfMessagesVisible({
            period: Duration.minutes(1),
          }),
        mHidden:
          stager.deadLetterQueue!.metricApproximateNumberOfMessagesNotVisible({
            period: Duration.minutes(1),
          }),
      },
    }).createAlarm(scope, `${scope.node.path}/NpmJs/Stager/DLQNotEmpty`, {
      alarmName: `${scope.node.path}/NpmJs/Stager/DLQNotEmpty`,
      alarmDescription: [
        'The NpmJS package stager is failing - its dead letter queue is not empty',
        '',
        `Link to the lambda function: ${lambdaFunctionUrl(stager)}`,
        `Link to the dead letter queue: ${sqsQueueUrl(
          stager.deadLetterQueue!
        )}`,
        '',
        `Runbook: ${RUNBOOK_URL}`,
      ].join('/n'),
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      threshold: 1,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    monitoring.addLowSeverityAlarm(
      'NpmJs/Stager DLQ Not Empty',
      dlqNotEmptyAlarm
    );

    // Finally - the "not running" alarm depends on the schedule (it won't run until the schedule
    // exists!), and the schedule depends on the failure alarm existing (we don't want it to run
    // before we can know it is failing). This means the returned `IDependable` effectively ensures
    // all alarms have been provisionned already! Isn't it nice!
    notRunningAlarm.node.addDependency(schedule);
    schedule.node.addDependency(failureAlarm);
  }

  private registerCanary(
    scope: Construct,
    packageName: string,
    visibilitySla: Duration,
    bucket: IBucket,
    constructHubBaseUrl: string,
    monitoring: IMonitoring
  ): IWidget[] {
    const canary = new NpmJsPackageCanary(scope, 'Canary', {
      bucket,
      constructHubBaseUrl,
      packageName,
    });

    const alarm = new MathExpression({
      expression: 'MAX([mDwell, mTTC])',
      period: Duration.minutes(1),
      usingMetrics: {
        mDwell: canary.metricDwellTime(),
        mTTC: canary.metricTimeToCatalog(),
      },
    }).createAlarm(canary, 'Alarm', {
      alarmName: `${canary.node.path}/SLA-Breached`,
      alarmDescription: [
        `New versions of ${packageName} have been published over ${visibilitySla.toHumanString()} ago and are still not visible in construct hub`,
        `Runbook: ${RUNBOOK_URL}`,
      ].join('\n'),
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      // If there is no data, the canary might not be running, so... *Chuckles* we're in danger!
      treatMissingData: TreatMissingData.BREACHING,
      threshold: visibilitySla.toSeconds(),
    });
    monitoring.addHighSeverityAlarm(
      'New version visibility SLA breached',
      alarm
    );

    return [
      new GraphWidget({
        height: 6,
        width: 12,
        title: 'Package Canary',
        left: [
          canary.metricDwellTime({ label: 'Dwell Time' }),
          canary.metricTimeToCatalog({ label: 'Time to Catalog' }),
        ],
        leftAnnotations: [
          {
            color: '#ff0000',
            label: `SLA (${visibilitySla.toHumanString()})`,
            value: visibilitySla.toSeconds(),
          },
        ],
        leftYAxis: { min: 0 },
        right: [
          canary.metricTrackedVersionCount({ label: 'Tracked Version Count' }),
        ],
        rightYAxis: { min: 0 },
      }),
    ];
  }
}

/**
 * How often 'rate' goes into 'duration' (rounded up)
 */
function howOften(rate: Duration, duration: Duration) {
  return Math.ceil(duration.toSeconds() / rate.toSeconds());
}
