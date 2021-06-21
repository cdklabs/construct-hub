import { ComparisonOperator, IAlarm } from '@aws-cdk/aws-cloudwatch';
import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Bucket, IBucket } from '@aws-cdk/aws-s3';
import { Queue } from '@aws-cdk/aws-sqs';
import { Construct, Duration } from '@aws-cdk/core';
import { Monitoring } from '../../monitoring';
import { Discovery as Handler } from './discovery';

export interface DiscoveryFunctionProps {
  /**
   * The monitoring handler to register alarms with.
   */
  readonly monitoring: Monitoring;

  /**
   * The queue to post package updated messages to
   */
  readonly queue: Queue;

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
   * Alarms if the discovery function does not complete successfully.
   */
  public readonly alarmErrors: IAlarm;

  /**
   * Alarms if the discovery function does not run as expected.
   */
  public readonly alarmNoInvocations: IAlarm;

  public constructor(scope: Construct, id: string, props: DiscoveryFunctionProps) {
    super(scope, id);

    this.bucket = new Bucket(this, 'StagingBucket', {
      lifecycleRules: [
        {
          prefix: 'staged/', // delete the staged tarball after 30 days
          expiration: Duration.days(30),
        },
      ],
    });

    // Note: the handler is designed to stop processing more batches about 2 minutes ahead of the timeout.
    const timeout = Duration.minutes(15);
    const lambda = new Handler(this, 'Default', {
      description: 'Periodically query npm.js index for new construct libraries',
      memorySize: 10_240,
      reservedConcurrentExecutions: 1, // Only one execution (avoids race conditions on the S3 marker object)
      timeout,
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        QUEUE_URL: props.queue.queueUrl,
      },
    });

    this.bucket.grantReadWrite(lambda);
    props.queue.grantSendMessages(lambda);

    new Rule(this, 'ScheduleRule', {
      schedule: Schedule.rate(timeout),
      targets: [new LambdaFunction(lambda)],
    });

    props.monitoring.watchful.watchLambdaFunction('Discovery Function', lambda);
    this.alarmErrors = lambda.metricErrors({ period: Duration.minutes(15) }).createAlarm(this, 'ErrorsAlarm', {
      alarmDescription: 'The discovery function (on npmjs.com) failed to run',
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      threshold: 1,
    });
    this.alarmNoInvocations = lambda.metricInvocations({ period: Duration.minutes(15) })
      .createAlarm(this, 'NoInvocationsAlarm', {
        alarmDescription: 'The discovery function (on npmjs.com) is not running as scheduled',
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
      });
  }
}
