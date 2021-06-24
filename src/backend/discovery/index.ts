import { ComparisonOperator, IAlarm, IMetric, Metric, Statistic } from '@aws-cdk/aws-cloudwatch';
import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { Function } from '@aws-cdk/aws-lambda';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { BlockPublicAccess, Bucket, IBucket } from '@aws-cdk/aws-s3';
import { IQueue, Queue, QueueEncryption } from '@aws-cdk/aws-sqs';

import { Construct, Duration } from '@aws-cdk/core';
import { Monitoring } from '../../monitoring';
import { DISCOVERY_MARKER_KEY, METRIC_NAMESPACE, METRIC_NAME_BATCH_PROCESSING_TIME, METRIC_NAME_BATCH_SIZE, METRIC_NAME_NEW_PACKAGE_VERSIONS, METRIC_NAME_PACKAGE_VERSION_AGE, METRIC_NAME_RELEVANT_PACKAGE_VERSIONS, METRIC_NAME_REMAINING_TIME, METRIC_NAME_STAGED_PACKAGE_VERSION_AGE, METRIC_NAME_STAGING_TIME, METRIC_NAME_UNPROCESSABLE_ENTITY, RESET_BEACON_KEY, STAGED_KEY_PREFIX } from './constants.lambda-shared';
import { NpmCatalogFollower } from './npm-catalog-follower';
import { StageAndNotify } from './stage-and-notify';

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

  private readonly npmCatalogFollower: Function;
  private readonly stageAndNotify: Function;

  public constructor(scope: Construct, id: string, props: DiscoveryProps) {
    super(scope, id);

    this.bucket = new Bucket(this, 'StagingBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          prefix: STAGED_KEY_PREFIX, // delete the staged tarball after 30 days
          expiration: Duration.days(30),
        },
      ],
    });

    const discoveryQueue = new Queue(this, 'DiscoveredPackages', {
      encryption: QueueEncryption.KMS_MANAGED,
      // This is a Lambda event source, visibility timeout needs to be >= to target function timeout
      visibilityTimeout: Duration.minutes(15),
    });

    // Note: the handler is designed to stop processing more batches about 2 minutes ahead of the timeout.
    const timeout = Duration.minutes(15);
    this.npmCatalogFollower = new NpmCatalogFollower(this, 'Default', {
      description: '[Discovery/NpmCatalogFollower] Periodically query npm.js index for new construct libraries',
      memorySize: 10_240,
      reservedConcurrentExecutions: 1, // Only one execution (avoids race conditions on the S3 marker object)
      timeout,
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        QUEUE_URL: discoveryQueue.queueUrl,
      },
    });
    discoveryQueue.grantSendMessages(this.npmCatalogFollower);
    this.bucket.grantReadWrite(this.npmCatalogFollower, DISCOVERY_MARKER_KEY);
    this.bucket.grantReadWrite(this.npmCatalogFollower, RESET_BEACON_KEY);

    this.stageAndNotify = new StageAndNotify(this, 'StageAndNotify', {
      deadLetterQueueEnabled: true,
      description: '[Discovery/StageAndNotify] Stages a new package version and notifies Construct Hub about it',
      memorySize: 10_240,
      timeout: Duration.minutes(15),
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        QUEUE_URL: props.queue.queueUrl,
      },
    });
    this.bucket.grantReadWrite(this.stageAndNotify, `${STAGED_KEY_PREFIX}*`);
    props.queue.grantSendMessages(this.stageAndNotify);
    this.stageAndNotify.addEventSource(new SqsEventSource(discoveryQueue));

    new Rule(this, 'ScheduleRule', {
      schedule: Schedule.rate(timeout),
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
    props.monitoring.watchful.watchLambdaFunction('Discovery stager', this.stageAndNotify);
    this.alarmDeadLetterQueueNotEmpty = this.stageAndNotify.deadLetterQueue!.metricApproximateNumberOfMessagesVisible()
      .createAlarm(this, 'AlarmDLQ', {
        alarmDescription: 'The dead-letter-queue associated with the discovery stage-and-notify function is not empty',
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
      });
  }

  public metricBatchProcessingTime(): IMetric {
    return new Metric({
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      metricName: METRIC_NAME_BATCH_PROCESSING_TIME,
      namespace: METRIC_NAMESPACE,
      statistic: Statistic.AVERAGE,
    });
  }

  public metricBatchSize(): IMetric {
    return new Metric({
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      metricName: METRIC_NAME_BATCH_SIZE,
      namespace: METRIC_NAMESPACE,
      statistic: Statistic.AVERAGE,
    });
  }

  public metricNewPackageVersions(): IMetric {
    return new Metric({
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      metricName: METRIC_NAME_NEW_PACKAGE_VERSIONS,
      namespace: METRIC_NAMESPACE,
      statistic: Statistic.SUM,
    });
  }

  public metricPackageVersionAge(): IMetric {
    return new Metric({
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      metricName: METRIC_NAME_PACKAGE_VERSION_AGE,
      namespace: METRIC_NAMESPACE,
      statistic: Statistic.MAXIMUM,
    });
  }

  public metricRelevantPackageVersions(): IMetric {
    return new Metric({
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      metricName: METRIC_NAME_RELEVANT_PACKAGE_VERSIONS,
      namespace: METRIC_NAMESPACE,
      statistic: Statistic.SUM,
    });
  }

  public metricRemainingTime(): IMetric {
    return new Metric({
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      metricName: METRIC_NAME_REMAINING_TIME,
      namespace: METRIC_NAMESPACE,
      statistic: Statistic.AVERAGE,
    });
  }

  public metricStagedPackageVersionAge(): IMetric {
    return new Metric({
      dimensions: {
        LogGroup: this.stageAndNotify.functionName,
        ServiceName: this.stageAndNotify.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      metricName: METRIC_NAME_STAGED_PACKAGE_VERSION_AGE,
      namespace: METRIC_NAMESPACE,
      statistic: Statistic.MAXIMUM,
    });
  }

  public metricStagingTime(): IMetric {
    return new Metric({
      dimensions: {
        LogGroup: this.stageAndNotify.functionName,
        ServiceName: this.stageAndNotify.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      metricName: METRIC_NAME_STAGING_TIME,
      namespace: METRIC_NAMESPACE,
      statistic: Statistic.AVERAGE,
    });
  }

  public metricUnprocessableEntity(): IMetric {
    return new Metric({
      dimensions: {
        LogGroup: this.npmCatalogFollower.functionName,
        ServiceName: this.npmCatalogFollower.functionName,
        ServiceType: 'AWS::Lambda::Function',
      },
      metricName: METRIC_NAME_UNPROCESSABLE_ENTITY,
      namespace: METRIC_NAMESPACE,
      statistic: Statistic.SUM,
    });
  }

}
