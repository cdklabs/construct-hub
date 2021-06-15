import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { IBucket } from '@aws-cdk/aws-s3';
import { IQueue } from '@aws-cdk/aws-sqs';

import { Construct, Duration } from '@aws-cdk/core';
import { Discovery as Handler } from './discovery';

export interface DiscoveryFunctionProps {

  readonly stagingBucket: IBucket;

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

export class DiscoveryFunction extends Construct {
  public constructor(scope: Construct, id: string, props: DiscoveryFunctionProps) {
    super(scope, id);

    const lambda = new Handler(this, 'Default', {
      description: 'Periodically query npm.js index for new Constructs',
      deadLetterQueueEnabled: true,
      memorySize: 10_240,
      timeout: Duration.minutes(15),
      environment: {
        STAGING_BUCKET_NAME: props.stagingBucket.bucketName,
        QUEUE_URL: props.queue.queueUrl,
      },
    });

    props.stagingBucket.grantReadWrite(lambda);
    props.queue.grantSendMessages(lambda);

    new Rule(this, 'ScheduleRule', {
      schedule: Schedule.rate(Duration.minutes(5)),
      targets: [new LambdaFunction(lambda)],
    });
  }
}
