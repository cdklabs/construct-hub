import { Duration } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import {
  ENV_DELETE_OBJECT_DATA_BUCKET_NAME,
  ENV_PRUNE_ON_CHANGE_FUNCTION_NAME,
  ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME,
  ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX,
  ENV_PRUNE_QUEUE_URL,
} from './constants';
import { PruneHandler } from './prune-handler';
import { PruneQueueHandler } from './prune-queue-handler';
import { Monitoring } from '../../monitoring';
import { OverviewDashboard } from '../../overview-dashboard';

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
   * The monitoring system.
   */
  readonly monitoring: Monitoring;

  /**
   * Overview dashboard
   */
  readonly overviewDashboard: OverviewDashboard;
}

/**
 * Reads the deny list and prunes all objects from the package data bucket
 * related to packages that match one of the deny list rules.
 */
export class Prune extends Construct {
  /**
   * The function that needs to read the deny list.
   */
  public readonly pruneHandler: lambda.Function;

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
        [ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME]:
          props.packageDataBucket.bucketName,
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
        [ENV_DELETE_OBJECT_DATA_BUCKET_NAME]:
          props.packageDataBucket.bucketName,
      },
    });
    props.packageDataBucket.grantDelete(deleteHandler);
    deleteHandler.addEventSource(new SqsEventSource(deleteQueue)); // reads from the queue

    this.pruneHandler = pruneHandler;
    this.queue = deleteQueue;
    this.deleteHandler = deleteHandler;

    props.monitoring.watchful.watchLambdaFunction(
      'Deny List - Prune Function',
      this.pruneHandler
    );
    props.monitoring.watchful.watchLambdaFunction(
      'Deny List - Prune Delete Function',
      this.deleteHandler
    );
    props.overviewDashboard.addConcurrentExecutionMetricToDashboard(
      this.pruneHandler,
      'PruneHandlerLambda'
    );
    props.overviewDashboard.addConcurrentExecutionMetricToDashboard(
      this.deleteHandler,
      'PruneQueueHandlerLambda'
    );
  }

  /**
   * Should be called to rebuild the catalog when the deny list changes.
   */
  public onChangeInvoke(callback: lambda.IFunction) {
    callback.grantInvoke(this.pruneHandler);
    this.pruneHandler.addEnvironment(
      ENV_PRUNE_ON_CHANGE_FUNCTION_NAME,
      callback.functionArn
    );
  }
}
