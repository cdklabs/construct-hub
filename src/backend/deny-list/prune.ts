import * as lambda from '@aws-cdk/aws-lambda';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import * as s3 from '@aws-cdk/aws-s3';
import * as sqs from '@aws-cdk/aws-sqs';
import { Construct, Duration } from '@aws-cdk/core';
import { Monitoring } from '../../monitoring';
import { ENV_DELETE_OBJECT_CATALOG_REBUILD_FUNCTION_NAME, ENV_DELETE_OBJECT_DATA_BUCKET_NAME, ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME, ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX, ENV_PRUNE_QUEUE_URL } from './constants';
import { PruneHandler } from './prune-handler';
import { PruneQueueHandler } from './prune-queue-handler';

/**
 * Props from `Prune`.
 */
export interface PruneProps {
  /**
   * The S3 bucket that includes the package data.
   */
  readonly packageDataBucket: s3.IBucket;

  /**
    * The S3 key prefix for all package data.
    */
  readonly packageDataKeyPrefix: string;

  /**
   * The catalog builder lambda function. Invoked
   * when a package is deleted to rebuild the catalog.
   */
  readonly catalogBuilderFunction: lambda.IFunction;

  /**
   * The monitoring system.
   */
  readonly monitoring: Monitoring;
}

/**
 * Reads the deny list and prunes all objects from the package data bucket
 * related to packages that match one of the deny list rules.
 */
export class Prune extends Construct {
  /**
   * The function that needs to read the deny list.
   */
  public readonly handler: lambda.Function;

  /**
   * The function that deletes files of denied packages.
   */
  public readonly deleteHandler: lambda.Function;

  /**
   * An SQS queue which includes objects to be deleted.
   */
  public readonly queue: sqs.Queue;

  constructor(scope: Construct, id: string, props: PruneProps) {
    super(scope, id);

    // invoke the prune handler every time the deny list is updated.
    const deleteQueue = new sqs.Queue(this, 'DeleteQueue', {
      visibilityTimeout: Duration.minutes(2), // must be larger than the timeout of PruneQueueHandler
    });

    // this handler reads the deny list and queues all the matched objects for
    // deletion into the prune queue.
    const pruneHandler = new PruneHandler(this, 'PruneHandler', {
      timeout: Duration.minutes(15),
      environment: {
        [ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME]: props.packageDataBucket.bucketName,
        [ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX]: props.packageDataKeyPrefix,
        [ENV_PRUNE_QUEUE_URL]: deleteQueue.queueUrl,
      },
    });
    deleteQueue.grantSendMessages(pruneHandler);
    props.packageDataBucket.grantRead(pruneHandler);

    // processes messages. each message includes an object key to delete.
    const deleteHandler = new PruneQueueHandler(this, 'PruneQueueHandler', {
      timeout: Duration.minutes(1),
      environment: {
        [ENV_DELETE_OBJECT_DATA_BUCKET_NAME]: props.packageDataBucket.bucketName,
        [ENV_DELETE_OBJECT_CATALOG_REBUILD_FUNCTION_NAME]: props.catalogBuilderFunction.functionArn,
      },
    });
    props.packageDataBucket.grantDelete(deleteHandler);
    props.catalogBuilderFunction.grantInvoke(deleteHandler);
    deleteHandler.addEventSource(new SqsEventSource(deleteQueue)); // reads from the queue

    this.handler = pruneHandler;
    this.queue = deleteQueue;
    this.deleteHandler = deleteHandler;

    props.monitoring.watchful.watchLambdaFunction('Deny List - Prune Function', this.handler);
    props.monitoring.watchful.watchLambdaFunction('Deny List - Prune Delete Function', this.deleteHandler);
  }
}