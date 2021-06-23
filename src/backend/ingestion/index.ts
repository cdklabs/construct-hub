import { ComparisonOperator, IAlarm } from '@aws-cdk/aws-cloudwatch';
import { IGrantable, IPrincipal } from '@aws-cdk/aws-iam';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { IBucket } from '@aws-cdk/aws-s3';
import { IQueue, Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { Construct, Duration } from '@aws-cdk/core';
import { Monitoring } from '../../monitoring';

import { Ingestion as Handler } from './ingestion';

export interface IngestionProps {
  /**
   * The bucket in which ingested objects are due to be inserted.
   */
  readonly bucket: IBucket;

  /**
   * The monitoring handler to register alarms with.
   */
  readonly monitoring: Monitoring;
}

/**
 * The ingestion function receives messages from discovery integrations and
 * processes their payloads into the provided S3 Bucket.
 *
 * This function is also an `IGrantable`, so that it can be granted permissions
 * to read from the source S3 buckets.
 */
export class Ingestion extends Construct implements IGrantable {
  public readonly grantPrincipal: IPrincipal;

  /**
   * Alarms if the dead-letter-queue associated with the ingestion process
   * is not empty, meaning some packages failed ingestion and require operator
   * attention.
   */
  public readonly alarmDeadLetterQueueNotEmpty: IAlarm;

  /**
   * The SQS queue that triggers the ingestion function.
   */
  public readonly queue: IQueue;

  public constructor(scope: Construct, id: string, props: IngestionProps) {
    super(scope, id);

    this.queue = new Queue(this, 'Queue', {
      encryption: QueueEncryption.KMS_MANAGED,
      visibilityTimeout: Duration.minutes(15),
    });

    const handler = new Handler(this, 'Default', {
      deadLetterQueueEnabled: true,
      description: 'Ingests new package versions into the Construct Hub',
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
      },
      memorySize: 10_240, // Currently the maximum possible setting
      retryAttempts: 2,
      timeout: Duration.minutes(15),
    });

    props.bucket.grantWrite(handler);

    handler.addEventSource(new SqsEventSource(this.queue, { batchSize: 1 }));

    this.grantPrincipal = handler.grantPrincipal;

    props.monitoring.watchful.watchLambdaFunction('Ingestion Function', handler);
    this.alarmDeadLetterQueueNotEmpty = handler.deadLetterQueue!.metricApproximateNumberOfMessagesVisible()
      .createAlarm(this, 'DLQAlarm', {
        alarmDescription: 'The ingestion function failed for one or more packages',
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
      });
  }
}
