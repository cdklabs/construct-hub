import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { BlockPublicAccess, Bucket, IBucket } from '@aws-cdk/aws-s3';
import { IQueue } from '@aws-cdk/aws-sqs';

import { Construct, Duration } from '@aws-cdk/core';
import { STAGED_KEY_PREFIX } from '../shared/constants.lambda-shared';
import { Discovery as Handler } from './discovery';

export interface DiscoveryProps {
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

export class Discovery extends Construct {
  /**
   * The bucket in which the discovery function stages objects before notifying
   * the Construct Hub about them.
   */
  public readonly bucket: IBucket;

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
