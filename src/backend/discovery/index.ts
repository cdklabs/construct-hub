import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Bucket, IBucket } from '@aws-cdk/aws-s3';
import { Queue } from '@aws-cdk/aws-sqs';

import { Construct, Duration } from '@aws-cdk/core';
import { Discovery as Handler } from './discovery';

export interface DiscoveryFunctionProps {
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

export class Discovery extends Construct {
  public readonly bucket: IBucket;

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
  }
}
