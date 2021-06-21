import { ComparisonOperator, IAlarm } from '@aws-cdk/aws-cloudwatch';
import { S3EventSource } from '@aws-cdk/aws-lambda-event-sources';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Bucket, EventType } from '@aws-cdk/aws-s3';
import { Construct, Duration } from '@aws-cdk/core';
import { Monitoring } from '../../monitoring';

import { constants } from '../shared';
import { Transliterator as Handler } from './transliterator';

export interface TransliteratorProps {
  /**
   * The bucket in which to source assemblies to transliterate.
   */
  readonly bucket: Bucket;

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
}

/**
 * Transliterates jsii assemblies to various other languages.
 */
export class Transliterator extends Construct {
  /**
   * Alarms if the dead-letter-queue associated with the transliteration process
   * is not empty, meaning some packages failed transliteration and require
   * operator attention.
   */
  public readonly alarmDeadLetterQueueNotEmpty: IAlarm;

  public constructor(scope: Construct, id: string, props: TransliteratorProps) {
    super(scope, id);

    const lambda = new Handler(this, 'Default', {
      deadLetterQueueEnabled: true,
      description: 'Creates transliterated assemblies from jsii-enabled npm packages',
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 10_240, // Currently the maximum possible setting
      retryAttempts: 2,
      timeout: Duration.minutes(15),
    });

    // The handler reads & writes to this bucket.
    props.bucket.grantReadWrite(lambda);

    // Creating the event chaining
    lambda.addEventSource(new S3EventSource(props.bucket, {
      events: [EventType.OBJECT_CREATED],
      filters: [{ prefix: constants.STORAGE_KEY_PREFIX, suffix: constants.PACKAGE_KEY_SUFFIX }],
    }));

    props.monitoring.watchful.watchLambdaFunction('Transliterator Function', lambda);
    this.alarmDeadLetterQueueNotEmpty = lambda.deadLetterQueue!.metricApproximateNumberOfMessagesVisible()
      .createAlarm(this, 'DLQAlarm', {
        alarmDescription: 'The transliteration function failed for one or more packages',
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
      });
  }
}
