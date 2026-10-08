import { Duration } from 'aws-cdk-lib';
import { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { IFunction, Function, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { IQueue, Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import {
  ENV_KNOWN_VERSIONS_TABLE_NAME,
  ENV_PACKUMENT_QUEUE_URL,
  PACKUMENT_MAX_ATTEMPTS,
} from './constants.lambda-shared';
import { PackumentProcessor } from './packument-processor';
import { IDenyList } from '../../backend/deny-list/api';
import { ILicenseList } from '../../backend/license-list/api';

export interface PackumentQueueProcessorProps {
  /** The table recording the package versions that were processed. */
  readonly knownVersions: ITableV2;

  /** The function that stages relevant package versions. */
  readonly stager: IFunction;

  readonly denyList?: IDenyList;
  readonly licenseList: ILicenseList;
}

/**
 * A queue of requests to process a package from the npm registry, and the
 * function that works through it. A request is retried with back-off until the
 * registry serves the revision the changes feed announced; after about a day
 * it is given up on, and moves to the dead-letter queue.
 */
export class PackumentQueueProcessor extends Construct {
  /** The packument requests. */
  public readonly queue: IQueue;

  /** The packument requests that were given up on. */
  public readonly deadLetterQueue: IQueue;

  /** The function processing the requests. */
  public readonly function: Function;

  public constructor(
    scope: Construct,
    id: string,
    props: PackumentQueueProcessorProps
  ) {
    super(scope, id);

    this.deadLetterQueue = new Queue(this, 'DLQ', {
      encryption: QueueEncryption.KMS_MANAGED,
      retentionPeriod: Duration.days(14),
    });
    this.queue = new Queue(this, 'Queue', {
      encryption: QueueEncryption.KMS_MANAGED,
      retentionPeriod: Duration.days(4),
      // Only used when the processor cannot schedule the next attempt itself,
      // for example on a timeout. AWS recommends 6x the function timeout.
      visibilityTimeout: Duration.minutes(30),
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: PACKUMENT_MAX_ATTEMPTS,
      },
    });

    this.function = new PackumentProcessor(this, 'Function', {
      description: `[${this.node.path}] Processes packages from the npm registry, retrying until the registry serves the revision announced by the changes feed`,
      environment: {
        AWS_EMF_ENVIRONMENT: 'Local',
        FUNCTION_NAME: props.stager.functionName,
        [ENV_KNOWN_VERSIONS_TABLE_NAME]: props.knownVersions.tableName,
        [ENV_PACKUMENT_QUEUE_URL]: this.queue.queueUrl,
      },
      memorySize: 2_048,
      timeout: Duration.minutes(5),
      tracing: Tracing.ACTIVE,
    });
    this.function.addEventSource(
      new SqsEventSource(this.queue, {
        batchSize: 10,
        reportBatchItemFailures: true,
        // Be gentle with the npm registry.
        maxConcurrency: 2,
      })
    );
    props.knownVersions.grantReadWriteData(this.function);
    props.denyList?.grantRead(this.function);
    props.licenseList.grantRead(this.function);
    props.stager.grantInvoke(this.function);
  }

  /**
   * Allows a function to send requests to the queue, and tells it where the
   * queue is.
   */
  public grantSendRequests(fn: Function): void {
    fn.addEnvironment(ENV_PACKUMENT_QUEUE_URL, this.queue.queueUrl);
    this.queue.grantSendMessages(fn);
  }
}
