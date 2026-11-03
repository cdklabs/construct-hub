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

/** The timeout of the packument processor function. */
const FUNCTION_TIMEOUT = Duration.minutes(5);

/**
 * The visibility timeout of the queue the function reads. Lambda requires at
 * least the function timeout; AWS recommends 6x.
 */
const QUEUE_VISIBILITY_TIMEOUT = Duration.minutes(
  6 * FUNCTION_TIMEOUT.toMinutes()
);

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
 * function that works through it. The follower sends a request for every
 * change entry. A request is retried with back-off until the registry serves
 * the revision the changes feed announced, or given up on after a day. Only
 * requests that keep failing the function move to the dead-letter queue.
 */
export class PackumentQueueProcessor extends Construct {
  /** The packument requests. */
  public readonly queue: IQueue;

  /** The packument requests that kept failing the function. */
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
      retentionPeriod: Duration.days(14),
      // Only used when the processor cannot schedule the next attempt itself,
      // for example on a timeout.
      visibilityTimeout: QUEUE_VISIBILITY_TIMEOUT,
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
      timeout: FUNCTION_TIMEOUT,
      tracing: Tracing.ACTIVE,
    });
    this.function.addEventSource(
      new SqsEventSource(this.queue, {
        batchSize: 10,
        reportBatchItemFailures: true,
        // Up to 100 packuments fetched at once, like the follower did before.
        maxConcurrency: 10,
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
