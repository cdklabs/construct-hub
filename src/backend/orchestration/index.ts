import { IQueue, Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { Fail, IStateMachine, JsonPath, Parallel, StateMachine, StateMachineType, TaskInput } from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import { Construct, Duration } from '@aws-cdk/core';
import { CatalogBuilder } from '../catalog-builder';
import { DocumentationLanguage } from '../shared/language';
import { Transliterator, TransliteratorProps } from '../transliterator';
import { RedriveStateMachine } from './redrive-state-machine';

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

  public constructor(scope: Construct, id: string, props: OrchestrationProps) {
    super(scope, id);

    const addToCatalog = new tasks.LambdaInvoke(this, 'Add to catalog.json', {
      lambdaFunction: new CatalogBuilder(this, 'CatalogBuilder', props).function,
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
        // Add to catalog once the TypeScript transliteration result is ready.
        if (language === DocumentationLanguage.TYPESCRIPT) {
          return task.next(addToCatalog);
        }
        return task;
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
    });

    // This function is intended to be manually triggered by an operrator to
    // attempt redriving messages from the DLQ.
    const redrive = new RedriveStateMachine(this, 'Redrive', {
      description: '[ConstructHub/Redrive] Manually redrives all messages from the backend dead letter queue',
      environment: {
        STATE_MACHINE_ARN: this.stateMachine.stateMachineArn,
        QUEUE_URL: this.deadLetterQueue.queueUrl,
      },
      memorySize: 1_024,
      timeout: Duration.minutes(15),
    });
    this.stateMachine.grantStartExecution(redrive);
    this.deadLetterQueue.grantConsumeMessages(redrive);
  }
}
