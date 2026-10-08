import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  AlarmRule,
  ComparisonOperator,
  CompositeAlarm,
  GraphWidget,
  IWidget,
  LogQueryWidget,
  MathExpression,
  Metric,
  MetricOptions,
  Statistic,
  Stats,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import {
  AttributeType,
  Billing,
  TableEncryptionV2,
  TableV2,
} from 'aws-cdk-lib/aws-dynamodb';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { IFunction, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { BlockPublicAccess, IBucket } from 'aws-cdk-lib/aws-s3';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { AlarmSeverity } from '../api';
import {
  dynamoDbTableUrl,
  lambdaFunctionUrl,
  logAnalyticsUrl,
  s3ObjectUrl,
  sqsQueueUrl,
} from '../deep-link';
import { fillMetric } from '../metric-utils';
import { addAlarm } from '../monitoring';
import { IMonitoring } from '../monitoring/api';
import type {
  IPackageSource,
  PackageSourceBindOptions,
  PackageSourceBindResult,
} from '../package-source';
import { RUNBOOK_URL } from '../runbook-url';
import { NpmJsPackageCanary } from './npmjs/canary';
import {
  ENV_KNOWN_VERSIONS_TABLE_NAME,
  FOLLOWER_STATE_FILE_NAME,
  KNOWN_VERSIONS_FILE_NAME,
  KnownVersionsAttribute,
  MARKER_FILE_NAME,
  METRICS_NAMESPACE,
  MetricName,
  S3KeyPrefix,
  SCAN_WINDOW_MS,
} from './npmjs/constants.lambda-shared';
import { KnownVersionsTableMigration } from './npmjs/known-versions-table-migration';
import { NpmJsFollower } from './npmjs/npm-js-follower';
import { PackumentQueueProcessor } from './npmjs/packument-queue-processor';
import { StageAndNotify } from './npmjs/stage-and-notify';
import { S3StorageFactory } from '../s3/storage';
import { ReStagePackageVersion } from './npmjs/re-stage-package-version';

/**
 * The periodicity at which the NpmJs follower will run. This MUST be a valid
 * CloudWatch Metric grain, as this will also be the period of the CloudWatch
 * alarm that monitors the health of the follower.
 */
const FOLLOWER_RUN_RATE = Duration.minutes(5);

/**
 * Alarm if we haven't seen changes over this time
 *
 * The CouchDB leader occasionally just starts tossing out timeouts and they
 * may last for a good while.
 *
 * - On 2022-09-29 it was slow for 12 hours.
 * - On 2022-10-04 it was slow for 2 hours.
 *
 * This is leading to extreme alarm fatigue, and also this alarm is non-actionable.
 * Let's be very very conservative here.
 */
const NO_CHANGES_ALARM_DURATION = Duration.hours(24);

/**
 * Alarm if more change entries than this had no packument in the registry
 * within 3 hours. In October 2026, a 3 hour window usually saw 170 of them,
 * and at most about 500. Well above that means a registry outage.
 */
const MISSING_PACKUMENTS_ALARM_THRESHOLD = 1_500;

/**
 * Alarm if 90% of the laggy packuments that caught up (or were given up on)
 * within 3 hours took longer than this.
 */
const LAGGY_PACKUMENT_LAG_ALARM_THRESHOLD = Duration.hours(6);

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

  /**
   * The maximum amount of time the canary package is expected to go without
   * publishing a new version. If exceeded, an alarm will fire indicating the
   * canary package may have stopped publishing, which would leave the SLA
   * alarm blind.
   *
   * @default Duration.days(1)
   */
  readonly canaryMaxStale?: Duration;

  /**
   * The billing mode of the table in which the follower records the package
   * versions it has processed.
   *
   * @default Billing.onDemand()
   */
  readonly knownVersionsTableBilling?: Billing;

  /**
   * Copies the known versions of a deployment created before the known
   * versions table existed from the staging bucket to the table, when the
   * table is created.
   *
   * Without the copy, an existing deployment starts with an empty table and
   * processes every version of every construct library again, as their
   * packages change. Turn this off for new deployments, or if the table was
   * filled some other way.
   *
   * @default true
   */
  readonly enableKnownVersionsMigration?: boolean;
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
        versioned: true,
        lifecycleRules: [
          {
            prefix: S3KeyPrefix.STAGED_KEY_PREFIX,
            expiration: Duration.days(30),
          },
          // Permanently delete marker file updates after 1 day (we don't need these)
          {
            prefix: MARKER_FILE_NAME,
            noncurrentVersionExpiration: Duration.days(1),
            expiredObjectDeleteMarker: true,
          },
          // Permanently delete known version backups after 30 days
          {
            prefix: KNOWN_VERSIONS_FILE_NAME,
            noncurrentVersionExpiration: Duration.days(30),
            expiredObjectDeleteMarker: true,
          },
          // Permanently delete follower state updates after 1 day (we don't need these)
          {
            prefix: FOLLOWER_STATE_FILE_NAME,
            noncurrentVersionExpiration: Duration.days(1),
            expiredObjectDeleteMarker: true,
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
      // Long enough for the 10 minute tarball 404 retry window, plus margin
      // to download and store a large tarball.
      timeout: Duration.minutes(13),
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

    // The package versions the follower has processed. Losing this table
    // means re-processing every construct library version ever published, so
    // it is retained and backed up.
    const knownVersions = new TableV2(scope, 'KnownVersions', {
      partitionKey: {
        name: KnownVersionsAttribute.NAME,
        type: AttributeType.STRING,
      },
      sortKey: {
        name: KnownVersionsAttribute.VERSION,
        type: AttributeType.STRING,
      },
      billing: this.props.knownVersionsTableBilling ?? Billing.onDemand(),
      encryption: TableEncryptionV2.dynamoOwnedKey(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const follower = new NpmJsFollower(scope, 'NpmJs', {
      description: `[${scope.node.path}/NpmJs] Periodically query npmjs.com index for new packages`,
      environment: {
        AWS_EMF_ENVIRONMENT: 'Local',
        BUCKET_NAME: bucket.bucketName,
        FUNCTION_NAME: stager.functionName,
        [ENV_KNOWN_VERSIONS_TABLE_NAME]: knownVersions.tableName,
      },
      memorySize: 10_024, // 10 GiB
      reservedConcurrentExecutions: 1, // Only one execution at a time, to avoid race conditions on the S3 follower state object
      timeout: FOLLOWER_RUN_RATE,
      tracing: Tracing.ACTIVE,
    });

    // The legacy marker is only read, to seed the follower state of existing
    // deployments.
    bucket.grantRead(follower, MARKER_FILE_NAME);
    bucket.grantReadWrite(follower, FOLLOWER_STATE_FILE_NAME);
    knownVersions.grantReadWriteData(follower);

    if (this.props.enableKnownVersionsMigration ?? true) {
      new KnownVersionsTableMigration(follower, 'KnownVersionsMigration', {
        bucket,
        table: knownVersions,
        follower,
      });
    }
    denyList?.grantRead(follower);
    licenseList.grantRead(follower);
    stager.grantInvoke(follower);

    // Requests to process a package from the registry again, because the
    // registry served an older revision than the changes feed announced, or
    // no packument at all yet.
    const packuments = new PackumentQueueProcessor(
      scope,
      'PackumentProcessor',
      { knownVersions, stager, denyList, licenseList }
    );
    packuments.grantSendRequests(follower);

    const restager = new ReStagePackageVersion(scope, 'ReStagePackageVersion', {
      description: `Manually re-stage a package version`,
      environment: {
        FUNCTION_NAME: stager.functionName,
        REGISTRY_URL: 'https://registry.npmjs.org',
      },
      memorySize: 1024,
      timeout: Duration.seconds(10),
    });
    stager.grantInvoke(restager);

    const rule = new Rule(scope, 'NpmJs/Schedule', {
      description: `${scope.node.path}/NpmJs/Schedule`,
      schedule: Schedule.rate(FOLLOWER_RUN_RATE),
      targets: [new LambdaFunction(follower)],
    });

    this.registerAlarms(
      scope,
      follower,
      stager,
      packuments.function,
      monitoring,
      rule
    );

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
    overviewDashboard.addDLQMetricToDashboard(
      'NPM JS Packument DLQ',
      packuments.deadLetterQueue
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
        {
          name: 'Follower State',
          url: s3ObjectUrl(bucket, FOLLOWER_STATE_FILE_NAME),
        },
        {
          name: 'Marker Object (legacy)',
          url: s3ObjectUrl(bucket, MARKER_FILE_NAME),
        },
        {
          name: 'Known Versions',
          url: dynamoDbTableUrl(knownVersions),
        },
        { name: 'Stager', url: lambdaFunctionUrl(stager) },
        { name: 'Stager DLQ', url: sqsQueueUrl(stager.deadLetterQueue!) },
        { name: 'Packument Queue', url: sqsQueueUrl(packuments.queue) },
        {
          name: 'Packument DLQ',
          url: sqsQueueUrl(packuments.deadLetterQueue),
        },
        {
          name: 'Packument Processor',
          url: lambdaFunctionUrl(packuments.function),
        },
        {
          name: 'Pipeline Trace (Log Analytics)',
          url: logAnalyticsUrl(
            [follower, stager],
            [
              'fields @timestamp, @log, @message',
              `| filter @message like /${
                this.props.canaryPackage ?? 'construct-hub-probe'
              }/`,
              '# filter @message like /<version>/ <- narrow down to a stuck version',
              '| sort @timestamp desc',
              '| limit 100',
            ].join('\n')
          ),
        },
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
            title: 'Feed Reliability',
            left: [
              fillMetric(
                this.metricLateChangeCount({ label: 'Late Changes' }),
                0
              ),
              fillMetric(
                this.metricLaggyPackuments({ label: 'Laggy Packuments' }),
                0
              ),
              fillMetric(
                this.metricLaggyPackumentsRecovered({
                  label: 'Laggy Packuments Recovered',
                }),
                0
              ),
              fillMetric(
                this.metricLaggyPackumentGiveUps({
                  label: 'Laggy Packument Give-Ups',
                }),
                0
              ),
              fillMetric(
                this.metricMissingPackuments({ label: 'Missing Packuments' }),
                0
              ),
              fillMetric(
                this.metricMissingPackumentsRecovered({
                  label: 'Missing Packuments Recovered',
                }),
                0
              ),
              fillMetric(
                this.metricMissingPackumentGiveUps({
                  label: 'Missing Packument Give-Ups',
                }),
                0
              ),
              fillMetric(
                this.metricMetadataFetchFailures({
                  label: 'Metadata Fetch Failures',
                }),
                0
              ),
            ],
            leftYAxis: { min: 0 },
            right: [
              this.metricLateChangeLag({ label: 'Late Change Lag (max)' }),
            ],
            rightAnnotations: [
              {
                color: '#ff0000',
                label: 'Scan Window',
                value: SCAN_WINDOW_MS,
              },
            ],
            rightYAxis: { label: 'Milliseconds', min: 0, showUnits: false },
            period: Duration.minutes(5),
          }),
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Packument Queue',
            // SQS reports these every 5 minutes, so no gaps need filling.
            left: [
              packuments.queue.metricApproximateNumberOfMessagesVisible({
                label: 'Waiting',
              }),
              packuments.queue.metricApproximateNumberOfMessagesNotVisible({
                label: 'Waiting for next attempt',
              }),
              packuments.queue.metricApproximateNumberOfMessagesDelayed({
                label: 'Delayed',
              }),
              packuments.deadLetterQueue.metricApproximateNumberOfMessagesVisible(
                { label: 'Given up (DLQ)' }
              ),
            ],
            leftYAxis: { min: 0 },
            right: [
              this.metricLaggyPackumentLag({ label: 'Laggy Packument Lag (p90)' }),
            ],
            rightAnnotations: [
              {
                color: '#ff0000',
                label: 'Alarm',
                value: LAGGY_PACKUMENT_LAG_ALARM_THRESHOLD.toMilliseconds(),
              },
            ],
            rightYAxis: { label: 'Milliseconds', min: 0, showUnits: false },
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
                this.props.canaryMaxStale ?? Duration.days(1),
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

  /**
   * The number of change entries discovered by a scan that were inserted into
   * the `_changes` feed behind a position the follower had already read past.
   */
  public metricLateChangeCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Stats.SUM,
      ...opts,
      metricName: MetricName.LATE_CHANGE_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * For each late change entry, the time elapsed between the moment the
   * follower first read past the entry's sequence number and the moment the
   * entry was discovered. This is a lower bound on the feed's insertion lag,
   * and can be used to tune the scan window.
   */
  public metricLateChangeLag(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Stats.MAXIMUM,
      ...opts,
      metricName: MetricName.LATE_CHANGE_LAG,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The number of change entries whose registry metadata could not be fetched
   * (after transient-error retries). These entries are not receipted, so a
   * later scan retries them.
   */
  public metricMetadataFetchFailures(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Stats.SUM,
      ...opts,
      metricName: MetricName.METADATA_FETCH_FAILURES,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The number of requests in the packument queue, for laggy and missing
   * packuments. A package that lagged in several change entries has several
   * requests.
   */
  public metricLaggyPackuments(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Stats.MAXIMUM,
      ...opts,
      metricName: MetricName.LAGGY_PACKUMENTS,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The number of laggy packuments for which the registry caught up with the
   * revision announced by the `_changes` feed.
   */
  public metricLaggyPackumentsRecovered(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Stats.SUM,
      ...opts,
      metricName: MetricName.LAGGY_PACKUMENTS_RECOVERED,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The number of laggy packuments given up on: the registry
   * never served the revision announced by the `_changes` feed within the
   * maximum retry age. A version announced by the feed may be missing until
   * the affected package publishes again.
   */
  public metricLaggyPackumentGiveUps(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Stats.SUM,
      ...opts,
      metricName: MetricName.LAGGY_PACKUMENT_GIVE_UPS,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * How long laggy packuments took to catch up (or until they were given up
   * on), measured from when the follower first saw them.
   */
  public metricLaggyPackumentLag(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Stats.p(90),
      ...opts,
      metricName: MetricName.LAGGY_PACKUMENT_LAG,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The number of change entries for which the registry had no packument at
   * all (HTTP 404). Usually a new package that has not replicated to the
   * registry yet; the packument processor keeps re-checking for it.
   */
  public metricMissingPackuments(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Stats.SUM,
      ...opts,
      metricName: MetricName.MISSING_PACKUMENTS,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The number of missing packuments the registry has since served.
   */
  public metricMissingPackumentsRecovered(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Stats.SUM,
      ...opts,
      metricName: MetricName.MISSING_PACKUMENTS_RECOVERED,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The number of missing packuments given up on: the registry never served a
   * packument for the package within the maximum retry age. Usually an old
   * change entry for a package that no longer exists.
   */
  public metricMissingPackumentGiveUps(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Stats.SUM,
      ...opts,
      metricName: MetricName.MISSING_PACKUMENT_GIVE_UPS,
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
    packumentProcessor: IFunction,
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
    monitoring.addLowSeverityAlarm('NpmJs/Follower Failures', failureAlarm);

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

    const dlqNotEmptyAlarm = stager
      .deadLetterQueue!.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(1),
      })
      .createAlarm(scope, `${scope.node.path}/NpmJs/Stager/DLQNotEmpty`, {
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
        comparisonOperator:
          ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 2,
        threshold: 1,
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });
    monitoring.addLowSeverityAlarm(
      'NpmJs/Stager DLQ Not Empty',
      dlqNotEmptyAlarm
    );

    const lateChangeLagAlarm = this.metricLateChangeLag({
      period: Duration.hours(1),
    }).createAlarm(scope, 'NpmJs/Follower/LateChangeLagHigh', {
      alarmName: `${scope.node.path}/NpmJs/Follower/LateChangeLagHigh`,
      alarmDescription: [
        'The NpmJs follower is discovering changes that were inserted into the CouchDB changes feed',
        'with a delay approaching the scan window. If the delay exceeds the window, the regular scan',
        'will miss those changes (only the daily deep scan would catch them). Consider increasing',
        'the scan window (SCAN_WINDOW_MS).',
        '',
        `Runbook: ${RUNBOOK_URL}`,
      ].join('\n'),
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      threshold: 0.8 * SCAN_WINDOW_MS,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    monitoring.addLowSeverityAlarm(
      'NpmJs/Follower Late Change Lag approaching scan window',
      lateChangeLagAlarm
    );

    const missingPackumentsAlarm = this.metricMissingPackuments({
      period: Duration.hours(3),
    }).createAlarm(scope, 'NpmJs/Follower/MissingPackumentsHigh', {
      alarmName: `${scope.node.path}/NpmJs/Follower/MissingPackumentsHigh`,
      alarmDescription: [
        'The npm registry had no packument for an unusually high number of packages announced by',
        'the CouchDB changes feed. This usually means the registry has an outage or is far behind',
        'the feed. The packument processor keeps re-checking these packages.',
        '',
        `Runbook: ${RUNBOOK_URL}`,
      ].join('\n'),
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      threshold: MISSING_PACKUMENTS_ALARM_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    monitoring.addLowSeverityAlarm(
      'NpmJs/Follower Missing Packuments High',
      missingPackumentsAlarm
    );

    const laggyPackumentLagAlarm = this.metricLaggyPackumentLag({
      period: Duration.hours(3),
      statistic: Stats.p(90),
    }).createAlarm(scope, 'NpmJs/PackumentProcessor/LaggyPackumentLagHigh', {
      alarmName: `${scope.node.path}/NpmJs/PackumentProcessor/LaggyPackumentLagHigh`,
      alarmDescription: [
        'Laggy packuments take unusually long to catch up: the npm registry serves older revisions',
        'than the CouchDB changes feed announced, for hours. This usually means the registry has an',
        'outage or is far behind the feed. The packument processor keeps re-checking these packages.',
        '',
        `Runbook: ${RUNBOOK_URL}`,
      ].join('\n'),
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      threshold: LAGGY_PACKUMENT_LAG_ALARM_THRESHOLD.toMilliseconds(),
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    monitoring.addLowSeverityAlarm(
      'NpmJs/PackumentProcessor Laggy Packument Lag High',
      laggyPackumentLagAlarm
    );

    const packumentProcessorFailuresAlarm = packumentProcessor
      .metricErrors({ period: Duration.minutes(15) })
      .createAlarm(scope, 'NpmJs/PackumentProcessor/Failures', {
        alarmName: `${scope.node.path}/NpmJs/PackumentProcessor/Failures`,
        alarmDescription: [
          'The packument processor function is failing (errors or time-outs). Requests in the',
          'packument queue use up their attempts while it fails, and may be given up on early.',
          '',
          `Link to the lambda function: ${lambdaFunctionUrl(
            packumentProcessor
          )}`,
          '',
          `Runbook: ${RUNBOOK_URL}`,
        ].join('\n'),
        comparisonOperator:
          ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 2,
        threshold: 1,
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });
    monitoring.addLowSeverityAlarm(
      'NpmJs/PackumentProcessor Failures',
      packumentProcessorFailuresAlarm
    );

    // Finally - the "not running" alarm depends on the schedule (it won't run until the schedule
    // exists!), and the schedule depends on the failure alarm existing (we don't want it to run
    // before we can know it is failing). This means the returned `IDependable` effectively ensures
    // all alarms have been provisioned already! Isn't it nice!
    notRunningAlarm.node.addDependency(schedule);
    schedule.node.addDependency(failureAlarm);
  }

  private registerCanary(
    scope: Construct,
    packageName: string,
    // A duration specifying how long we expect the probe package to appear on
    // Construct Hub after it gets published to npm, assuming the npm replica
    // is up to date etc.
    visibilitySla: Duration,
    // A duration specifying how long the canary package can go without
    // publishing a new version before we alarm.
    maxStale: Duration,
    bucket: IBucket,
    constructHubBaseUrl: string,
    monitoring: IMonitoring
  ): IWidget[] {
    const canary = new NpmJsPackageCanary(scope, 'Canary', {
      bucket,
      constructHubBaseUrl,
      packageName,
    });

    const period = Duration.minutes(10); // we run canary once per hour, but not guaranteed exact times
    const alarm = new MathExpression({
      expression: 'MAX([mDwell, mTTC])',
      period,
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
      evaluationPeriods: 1,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      threshold: visibilitySla.toSeconds(),
    });
    // This is deemed low severity, because the npm registry replica (replicate.npmjs.com) can
    // occasionally lag several hours behind the primary (registry.npmjs.com), and we cannot easily
    // tell about that. Someone should have a look, but in virtually all cases we have seen so far,
    // there is nothing that can be done from our end, besides waiting for the replica to be all
    // caught up.
    addAlarm(
      'New version visibility SLA breached',
      alarm,
      AlarmSeverity.LOW,
      monitoring
    );

    const staleAlarm = canary
      .metricTimeSinceLastPublish({ period })
      .createAlarm(canary, 'StaleCanaryPackage', {
        alarmName: `${canary.node.path}/StaleCanaryPackage`,
        alarmDescription: [
          `The canary package ${packageName} has not published a new version in over ${maxStale.toHumanString()}.`,
          'This means the SLA alarm is blind — no new versions are being tracked, so SLA breaches cannot be detected.',
          'Metric: ConstructHub/PackageCanary / TimeSinceLastPublish',
          '',
          `Runbook: ${RUNBOOK_URL}`,
        ].join('\n'),
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: TreatMissingData.MISSING,
        threshold: maxStale.toSeconds(),
      });
    monitoring.addMediumSeverityAlarm(
      'Canary package has stopped publishing new versions',
      staleAlarm
    );

    const notRunningOrFailingAlarm = new CompositeAlarm(
      canary,
      'NotRunningOrFailing',
      {
        alarmRule: AlarmRule.anyOf(
          canary
            .metricErrors({ period, statistic: Statistic.SUM })
            .createAlarm(canary, 'Failing', {
              alarmName: `${canary.node.path}/Failing`,
              comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
              evaluationPeriods: 2,
              threshold: 0,
              treatMissingData: TreatMissingData.BREACHING,
            }),
          canary
            .metricInvocations({ period, statistic: Statistic.SUM })
            .createAlarm(canary, 'NotRunning', {
              alarmName: `${canary.node.path}/NotRunning`,
              comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
              evaluationPeriods: 2,
              threshold: 1,
              treatMissingData: TreatMissingData.BREACHING,
            })
        ),
        alarmDescription: [
          'The NpmJs package canary is not running or is failing. This prevents alarming when this instance of',
          'ConstructHub falls out of SLA for new package ingestion!',
          '',
          `Runbook: ${RUNBOOK_URL}`,
        ].join('\n'),
        compositeAlarmName: `${canary.node.path}/NotRunningOrFailing`,
      }
    );
    monitoring.addHighSeverityAlarm(
      'NpmJs Follower Canary is not running or fails',
      notRunningOrFailingAlarm
    );

    // Using MIN statistic, so if a run is successful (and hence emits a 0), this alarm will not trigger.
    const gatewayErrorsAlarm = canary
      .metricHttpGatewayErrors({ period, statistic: Statistic.MINIMUM })
      .createAlarm(canary, 'GatewayErrors', {
        alarmDescription: [
          'The NpmJs package canary has been encountering consistent HTTP gateway errors when contacting npmjs servers',
          'for an hour or more. This means the canary has been unable to evaluate SLA compliance for that much time.',
          'It is probable that nothing can be done except for waiting for npm servers to come back online, but the',
          'situation should be checked to make sure there is not another problem.',
          '',
          `Runbook: ${RUNBOOK_URL}`,
        ].join('\n'),
        alarmName: `${canary.node.path}/GatewayErrors`,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 60,
        threshold: 0,
        treatMissingData: TreatMissingData.BREACHING,
      });
    monitoring.addLowSeverityAlarm(
      'NpmJs Follower Canary is experiencing HTTP Gateway errors',
      gatewayErrorsAlarm
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
      }),
      new LogQueryWidget({
        height: 6,
        width: 12,
        title: 'Stuck Versions (still not visible in ConstructHub)',
        logGroupNames: [canary.logGroupName],
        queryLines: [
          'fields @timestamp, @message',
          'filter @message like /"DwellTime"/',
          'filter toMillis(@timestamp) > (now() - 900) * 1000',
          `parse @message '"PackageVersion":"*"' as version`,
          `parse @message '"DwellTime":*,' as dwellTimeSec`,
          'stats max(dwellTimeSec) as maxDwellTimeSec by version',
          'sort maxDwellTimeSec desc',
        ],
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
