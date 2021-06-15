import { S3EventSource } from '@aws-cdk/aws-lambda-event-sources';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Bucket, EventType } from '@aws-cdk/aws-s3';
import { Construct, Duration } from '@aws-cdk/core';

import { Transliterator as Handler } from './transliterator';

export interface TransliteratorProps {
  readonly bucket: Bucket;

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
      filters: [{ prefix: 'packages/', suffix: '/package.tgz' }],
    }));
  }
}
