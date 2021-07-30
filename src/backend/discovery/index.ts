import { Alarm, ComparisonOperator, Metric, MetricOptions, Statistic } from '@aws-cdk/aws-cloudwatch';
import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { Tracing, Function } from '@aws-cdk/aws-lambda';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { BlockPublicAccess, Bucket, IBucket } from '@aws-cdk/aws-s3';
import { IQueue, Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { Construct, Duration } from '@aws-cdk/core';
import { lambdaFunctionUrl } from '../../deep-link';
import { Monitoring } from '../../monitoring';
import { DenyList } from '../deny-list';
import { MetricName, METRICS_NAMESPACE, S3KeyPrefix, DISCOVERY_MARKER_KEY } from './constants';
import { Follow } from './follow';
import { Stage } from './stage';

export interface DiscoveryProps {
  /**
   * The monitoring handler to register alarms with.
   */
  readonly monitoring: Monitoring;

  /**
   * The queue to post package updated messages to
   */
  readonly queue: IQueue;

  /**
   * How long should execution logs be retained?
   *
   * @default RetentionDays.TEN_YEARS
   */
  readonly logRetention?: RetentionDays;

  /**
   * The deny list construct.
   */
  readonly denyList: DenyList;
}

/**
 * This discovery function periodically scans the CouchDB replica of npmjs.com
 * to discover newly published packages that are relevant for indexing in the
 * Construct Hub, then notifies the ingestion function about those.
 */
export class Discovery extends Construct {
  /**
   * The S3 bucket in which the discovery function stages npm packages.
   */
  public readonly bucket: IBucket;

  /**
   * Alarms when the dead-letter-queue associated with the stage function is not empty.
   */
  public readonly alarmDeadLetterQueueNotEmpty: Alarm;

  /**
   * Alarms if the discovery function does not complete successfully.
   */
  public readonly alarmErrors: Alarm;

  /**
   * Alarms if the discovery function does not run as expected.
   */
  public readonly alarmNoInvocations: Alarm;

  public readonly follow: Function;
  public readonly stage: Function;
  public readonly queue: Queue;

  private readonly timeout = Duration.minutes(15);

  public constructor(scope: Construct, id: string, props: DiscoveryProps) {
    super(scope, id);

    this.bucket = new Bucket(this, 'StagingBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [
        {
          prefix: S3KeyPrefix.STAGED_KEY_PREFIX, // delete the staged tarball after 30 days
          expiration: Duration.days(30),
        },
      ],
    });

    this.queue = new Queue(this, 'DiscoveredPackages', {
      encryption: QueueEncryption.KMS_MANAGED,
      // This is a Lambda event source, visibility timeout needs to be >= to target function timeout
      visibilityTimeout: this.timeout,
    });

    this.follow = new Follow(this, 'Default', {
      description: '[ConstructHub/Discovery/NpmCatalogFollower] Periodically query npm.js index for new construct libraries',
      memorySize: 10_240,
      /// Only one execution (avoids race conditions on the S3 marker object)
      reservedConcurrentExecutions: 1,
      timeout: this.timeout,
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        QUEUE_URL: this.queue.queueUrl,
      },
      tracing: Tracing.ACTIVE,
    });
    this.queue.grantSendMessages(this.follow);
    this.bucket.grantReadWrite(this.follow, DISCOVERY_MARKER_KEY);
    props.denyList.grantRead(this.follow);

    this.stage = new Stage(this, 'Stage', {
      deadLetterQueueEnabled: true,
      description: '[Discovery/StageAndNotify] Stages a new package version and notifies Construct Hub about it',
      memorySize: 10_240,
      timeout: Duration.minutes(15),
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        QUEUE_URL: props.queue.queueUrl,
      },
    });
    this.bucket.grantReadWrite(this.stage, `${S3KeyPrefix.STAGED_KEY_PREFIX}*`);
    props.queue.grantSendMessages(this.stage);
    this.stage.addEventSource(new SqsEventSource(this.queue));

    new Rule(this, 'ScheduleRule', {
      schedule: Schedule.rate(this.timeout),
      targets: [new LambdaFunction(this.follow)],
    });

    this.alarmErrors = this.follow.metricErrors({ period: Duration.minutes(15) })
      .createAlarm(this, 'ErrorsAlarm', {
        alarmName: `${this.node.path}/Errors`,
        alarmDescription: [
          'The discovery/follow function (on npmjs.com) failed to run',
          '',
          `Direct link to Lambda function: ${lambdaFunctionUrl(this.follow)}`,
        ].join('\n'),
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 2,
        threshold: 1,
      });
    this.alarmNoInvocations = this.follow.metricInvocations({ period: Duration.minutes(15) })
      .createAlarm(this, 'NoInvocationsAlarm', {
        alarmName: `${this.node.path}/NotRunning`,
        alarmDescription: [
          'The discovery/follow function (on npmjs.com) is not running as scheduled',
          '',
          `Direct link to Lambda function: ${lambdaFunctionUrl(this.follow)}`,
        ].join('\n'),
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
      });
    this.bucket.grantReadWrite(this.stage);
    props.queue.grantSendMessages(this.stage);

    props.monitoring.addHighSeverityAlarm('Discovery Failures', this.alarmErrors);
    props.monitoring.addHighSeverityAlarm('Discovery not Running', this.alarmNoInvocations);

    this.alarmDeadLetterQueueNotEmpty = this.stage.deadLetterQueue!.metricApproximateNumberOfMessagesVisible()
      .createAlarm(this, 'AlarmDLQ', {
        alarmDescription: 'The dead-letter-queue associated with the discovery stage-and-notify function is not empty',
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
      });
  }

  /**
   * The average time it took to process a changes batch.
   */
  public metricBatchProcessingTime(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.timeout,
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
      period: this.timeout,
      statistic: Statistic.AVERAGE,
      ...opts,
      metricName: MetricName.CHANGE_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricNpmJsChangeAge(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.timeout,
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
      period: this.timeout,
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
      period: this.timeout,
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
      period: this.timeout,
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
      period: this.timeout,
      statistic: Statistic.AVERAGE,
      ...opts,
      metricName: MetricName.REMAINING_TIME,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The average time it took to stage a package to S3.
   */
  public metricStagingTime(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.timeout,
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
      period: this.timeout,
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.UNPROCESSABLE_ENTITY,
      namespace: METRICS_NAMESPACE,
    });
  }

}
