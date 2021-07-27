import { ComparisonOperator, IAlarm, Metric, MetricOptions, Statistic } from '@aws-cdk/aws-cloudwatch';
import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { Tracing, Function } from '@aws-cdk/aws-lambda';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { BlockPublicAccess, Bucket, IBucket } from '@aws-cdk/aws-s3';
import { IQueue, Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { Construct, Duration } from '@aws-cdk/core';
import { Monitoring } from '../../monitoring';
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
   * Alarms when the dead-letter-queue associated with the stage-and-notify
   * function is not empty.
   */
  public readonly alarmDeadLetterQueueNotEmpty: IAlarm;

  /**
   * Alarms if the discovery function does not complete successfully.
   */
  public readonly alarmErrors: IAlarm;

  /**
   * Alarms if the discovery function does not run as expected.
   */
  public readonly alarmNoInvocations: IAlarm;

  public readonly npmCatalogFollower: Function;
  public readonly stageAndNotify: Function;

  private readonly timeout = Duration.minutes(15);

  public constructor(scope: Construct, id: string, props: DiscoveryProps) {
    super(scope, id);

    this.bucket = new Bucket(this, 'StagingBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [
        {
          // delete the staged tarball after 30 days
          prefix: S3KeyPrefix.STAGED_KEY_PREFIX,
          expiration: Duration.days(30),
        },
      ],
    });

    const discoveryQueue = new Queue(this, 'DiscoveredPackages', {
      encryption: QueueEncryption.KMS_MANAGED,
      // This is a Lambda event source, visibility timeout needs to be >= to target function timeout
      visibilityTimeout: this.timeout,
    });

    this.npmCatalogFollower = new Follow(this, 'Default', {
      description: '[ConstructHub/Discovery/NpmCatalogFollower] Periodically query npm.js index for new construct libraries',
      memorySize: 10_240,
      /// Only one execution (avoids race conditions on the S3 marker object)
      reservedConcurrentExecutions: 1,
      timeout: this.timeout,
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        QUEUE_URL: discoveryQueue.queueUrl,
      },
      tracing: Tracing.ACTIVE,
    });
    discoveryQueue.grantSendMessages(this.npmCatalogFollower);
    this.bucket.grantReadWrite(this.npmCatalogFollower, DISCOVERY_MARKER_KEY);

    this.stageAndNotify = new Stage(this, 'Stage', {
      deadLetterQueueEnabled: true,
      description: '[Discovery/StageAndNotify] Stages a new package version and notifies Construct Hub about it',
      memorySize: 10_240,
      timeout: Duration.minutes(15),
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        QUEUE_URL: props.queue.queueUrl,
      },
    });
    this.bucket.grantReadWrite(this.stageAndNotify, `${S3KeyPrefix.STAGED_KEY_PREFIX}*`);
    props.queue.grantSendMessages(this.stageAndNotify);
    this.stageAndNotify.addEventSource(new SqsEventSource(discoveryQueue));

    new Rule(this, 'ScheduleRule', {
      schedule: Schedule.rate(this.timeout),
      targets: [new LambdaFunction(this.npmCatalogFollower)],
    });

    props.monitoring.watchful.watchLambdaFunction('Discovery npmjs.com follower', this.npmCatalogFollower);
    this.alarmErrors = this.npmCatalogFollower.metricErrors({ period: Duration.minutes(15) })
      .createAlarm(this, 'ErrorsAlarm', {
        alarmDescription: 'The npm catalog follower function failed to run',
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
      });
    this.alarmNoInvocations = this.npmCatalogFollower.metricInvocations({ period: Duration.minutes(15) })
      .createAlarm(this, 'NoInvocationsAlarm', {
        alarmDescription: 'The npm catalog follower function is not running as scheduled',
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
      });
    this.bucket.grantReadWrite(this.stageAndNotify);
    props.queue.grantSendMessages(this.stageAndNotify);

    props.monitoring.watchful.watchLambdaFunction('Discovery stager', this.stageAndNotify);
    this.alarmDeadLetterQueueNotEmpty = this.stageAndNotify.deadLetterQueue!.metricApproximateNumberOfMessagesVisible()
      .createAlarm(this, 'AlarmDLQ', {
        alarmDescription: 'The dead-letter-queue associated with the discovery stage-and-notify function is not empty',
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
      });
  }

  public metricBatchProcessingTime(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.timeout,
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      statistic: Statistic.AVERAGE,
      ...opts,
      metricName: MetricName.BATCH_PROCESSING_TIME,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricChangeCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.timeout,
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
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

  public metricNewPackageVersions(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.timeout,
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.NEW_PACKAGE_VERSIONS,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricPackageVersionAge(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.timeout,
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.PACKAGE_VERSION_AGE,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricRelevantPackageVersions(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.timeout,
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.RELEVANT_PACKAGE_VERSIONS,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricRemainingTime(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.timeout,
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      statistic: Statistic.AVERAGE,
      ...opts,
      metricName: MetricName.REMAINING_TIME,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricStagedPackageVersionAge(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.timeout,
      dimensions: {
        LogGroup: this.stageAndNotify.functionName,
        ServiceName: this.stageAndNotify.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.STAGED_PACKAGE_VERSION_AGE,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricStagingTime(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.timeout,
      dimensions: {
        LogGroup: this.stageAndNotify.functionName,
        ServiceName: this.stageAndNotify.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      statistic: Statistic.AVERAGE,
      ...opts,
      metricName: MetricName.STAGING_TIME,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricUnprocessableEntity(opts?: MetricOptions): Metric {
    return new Metric({
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.UNPROCESSABLE_ENTITY,
      namespace: METRICS_NAMESPACE,
    });
  }

}
