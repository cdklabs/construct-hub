import { IFunction, Tracing } from '@aws-cdk/aws-lambda';
import { IQueue, Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { Fail, IStateMachine, JsonPath, Parallel, StateMachine, StateMachineType, TaskInput } from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import { Construct, Duration } from '@aws-cdk/core';
import { CatalogBuilder } from '../catalog-builder';
import { DocumentationLanguage } from '../shared/language';
import { Transliterator, TransliteratorProps } from '../transliterator';
import { RedriveStateMachine } from './redrive-state-machine';
import { ReprocessAll } from './reprocess-all';

const SUPPORTED_LANGUAGES = [DocumentationLanguage.PYTHON, DocumentationLanguage.TYPESCRIPT];

export interface OrchestrationProps extends Omit<TransliteratorProps, 'language'>{}

/**
 * Orchestrates the backend processing tasks using a StepFunctions State Machine.
 */
export class Orchestration extends Construct {
  /**
   * The state machine that should be triggered for starting back-end processing
   * for a newly discovered package.
   */
  public readonly stateMachine: IStateMachine;

  /**
   * The dead letter queue from the state machine. Inputs and errors are written
   * there if the state machine fails.
   */
  public readonly deadLetterQueue: IQueue;

  /**
   * The function operators can use to redrive messages from the dead letter
   * queue.
   */
  public readonly redriveFunction: IFunction;

  /**
   * The function operators can use to reprocess all indexed packages through
   * the backend data pipeline.
   */
  public readonly reprocessAllFunction: IFunction;

  public constructor(scope: Construct, id: string, props: OrchestrationProps) {
    super(scope, id);

    const catalogBuilder = new CatalogBuilder(this, 'CatalogBuilder', props).function;
    const addToCatalog = (lang: DocumentationLanguage) => new tasks.LambdaInvoke(this, `Add to catalog.json (${lang})`, {
      lambdaFunction: catalogBuilder,
      resultPath: '$.catalogBuilderOutput',
      resultSelector: {
        'ETag.$': '$.Payload.ETag',
        'VersionId.$': '$.Payload.VersionId',
      },
    })
      // This has a concurrency of 1, so we want to aggressively retry being throttled here.
      .addRetry({ errors: ['Lambda.TooManyRequestsException'], interval: Duration.seconds(30), maxAttempts: 5 });

    this.deadLetterQueue = new Queue(this, 'DLQ', {
      encryption: QueueEncryption.KMS_MANAGED,
      retentionPeriod: Duration.days(14),
      visibilityTimeout: Duration.minutes(15),
    });

    const sendToDeadLetterQueue = new tasks.SqsSendMessage(this, 'Send to Dead Letter Queue', {
      messageBody: TaskInput.fromJsonPathAt('$'),
      queue: this.deadLetterQueue,
      resultPath: JsonPath.DISCARD,
    });

    const definition = new Parallel(this, 'DocGen')
      .branch(...SUPPORTED_LANGUAGES.map((language) => {
        const task = new tasks.LambdaInvoke(this, `Generate ${language} docs`, {
          lambdaFunction: new Transliterator(this, `DocGen-${language}`, { ...props, language }).function,
          resultPath: '$.docGenOutput',
          resultSelector: { [`${language}.$`]: '$.Payload' },
        }).addRetry({ interval: Duration.seconds(30) });
        return task.next(addToCatalog(language));
      }))
      .addCatch(
        sendToDeadLetterQueue.next(new Fail(this, 'Fail', {
          error: 'Failed',
          cause: 'Input was submitted to dead letter queue',
        })),
        { resultPath: '$._error' },
      );

    this.stateMachine = new StateMachine(this, 'Resource', {
      definition,
      stateMachineType: StateMachineType.STANDARD,
      timeout: Duration.hours(1),
      tracingEnabled: true,
    });

    // This function is intended to be manually triggered by an operrator to
    // attempt redriving messages from the DLQ.
    this.redriveFunction = new RedriveStateMachine(this, 'Redrive', {
      description: '[ConstructHub/Redrive] Manually redrives all messages from the backend dead letter queue',
      environment: {
        STATE_MACHINE_ARN: this.stateMachine.stateMachineArn,
        QUEUE_URL: this.deadLetterQueue.queueUrl,
      },
      memorySize: 1_024,
      timeout: Duration.minutes(15),
      tracing: Tracing.ACTIVE,
    });
    this.stateMachine.grantStartExecution(this.redriveFunction);
    this.deadLetterQueue.grantConsumeMessages(this.redriveFunction);

    // This function is intended to be manually triggered by an operator to
    // reprocess all package versions currently in store through the back-end.
    this.reprocessAllFunction = new ReprocessAll(this, 'ReprocessAll', {
      description: '[ConstructHub/ReprocessAll] Reprocess all package versions through the backend',
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        STATE_MACHINE_ARN: this.stateMachine.stateMachineArn,
      },
      memorySize: 1_024,
      timeout: Duration.minutes(15),
    });
    props.bucket.grantRead(this.reprocessAllFunction);
    this.stateMachine.grantStartExecution(this.reprocessAllFunction);
  }
}
