import { S3EventSource } from '@aws-cdk/aws-lambda-event-sources';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Bucket, EventType } from '@aws-cdk/aws-s3';
import { Construct, Duration } from '@aws-cdk/core';

import { Handler } from './handler';

export interface TransliteratorProps {
  readonly sourceBucket: Bucket;

  /**
   * How long should execution logs be retained?
   *
   * @default RetentionDays.TEN_YEARS
   */
  readonly logRetention?: RetentionDays;
}

export class Transliterator extends Construct {
  public constructor(scope: Construct, id: string, props: TransliteratorProps) {
    super(scope, id);

    const lambda = new Handler(this, 'Default', {
      deadLetterQueueEnabled: true,
      memorySize: 10_240, // Currently the maximum possible setting
      retryAttempts: 2,
      timeout: Duration.minutes(15),
    });

    // The handler reads & writes to this bucket.
    props.sourceBucket.grantReadWrite(lambda);

    // Creating the event chaining
    lambda.addEventSource(new S3EventSource(props.sourceBucket, {
      events: [EventType.OBJECT_CREATED],
      filters: [{ prefix: 'packages/', suffix: '/package.tgz' }],
    }));
  }
}
