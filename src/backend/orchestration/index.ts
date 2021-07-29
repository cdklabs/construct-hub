import { ComparisonOperator, MathExpression } from '@aws-cdk/aws-cloudwatch';
import { IFunction, Tracing } from '@aws-cdk/aws-lambda';
import { IQueue, Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { Choice, Condition, IStateMachine, JsonPath, Parallel, Pass, StateMachine, StateMachineType, Succeed, TaskInput } from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import { Construct, Duration } from '@aws-cdk/core';
import { sqsQueueUrl, stateMachineUrl } from '../../deep-link';
import { CatalogBuilder } from '../catalog-builder';
import { DenyList } from '../deny-list';
import { DocumentationLanguage } from '../shared/language';
import { Transliterator, TransliteratorProps } from '../transliterator';
import { RedriveStateMachine } from './redrive-state-machine';
import { ReprocessAll } from './reprocess-all';

const SUPPORTED_LANGUAGES = [DocumentationLanguage.PYTHON, DocumentationLanguage.TYPESCRIPT];

export interface OrchestrationProps extends Omit<TransliteratorProps, 'language'>{
  /**
   * The deny list.
   */
  readonly denyList: DenyList;
}

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

  /**
   * The function that builds the catalog.
   */
  public readonly catalogBuilder: IFunction;

  public constructor(scope: Construct, id: string, props: OrchestrationProps) {
    super(scope, id);

    this.deadLetterQueue = new Queue(this, 'DLQ', {
      encryption: QueueEncryption.KMS_MANAGED,
      retentionPeriod: Duration.days(14),
      visibilityTimeout: Duration.minutes(15),
    });

    props.monitoring.addHighSeverityAlarm(
      'Backend Orchestration Dead-Letter Queue is not empty',
      new MathExpression({
        expression: 'm1 + m2',
        usingMetrics: {
          m1: this.deadLetterQueue.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(1) }),
          m2: this.deadLetterQueue.metricApproximateNumberOfMessagesNotVisible({ period: Duration.minutes(1) }),
        },
      }).createAlarm(this, 'DLQAlarm', {
        alarmName: `${this.deadLetterQueue.node.path}/NotEmpty`,
        alarmDescription: [
          'Backend orchestration dead-letter queue is not empty.',
          '',
          `Direct link to queue: ${sqsQueueUrl(this.deadLetterQueue)}`,
          'Warning: State Machines executions that sent messages to the DLQ will not show as "failed".',
        ].join('\n'),
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
      }),
    );

    const sendToDeadLetterQueue = new tasks.SqsSendMessage(this, 'Send to Dead Letter Queue', {
      messageBody: TaskInput.fromJsonPathAt('$'),
      queue: this.deadLetterQueue,
      resultPath: JsonPath.DISCARD,
    });

    this.catalogBuilder = new CatalogBuilder(this, 'CatalogBuilder', props).function;

    const addToCatalog = new tasks.LambdaInvoke(this, 'Add to catalog.json', {
      lambdaFunction: this.catalogBuilder,
      resultPath: '$.catalogBuilderOutput',
      resultSelector: {
        'ETag.$': '$.Payload.ETag',
        'VersionId.$': '$.Payload.VersionId',
      },
    })
      // This has a concurrency of 1, so we want to aggressively retry being throttled here.
      .addRetry({ errors: ['Lambda.TooManyRequestsException'], interval: Duration.seconds(30), maxAttempts: 5 })
      .addCatch(new Pass(this, 'Add to catalog.json failure', {
        parameters: { 'error.$': 'States.StringToJson($.Cause)' },
        resultPath: '$.error',
      }).next(sendToDeadLetterQueue), { errors: ['States.TaskFailed'] })
      .addCatch(new Pass(this, 'Add to catalog.json fault', {
        parameters: { 'error.$': '$.Cause' },
        resultPath: '$.error',
      }).next(sendToDeadLetterQueue), { errors: ['States.ALL'] });

    const docGenResultsKey = 'DocGen';
    const sendToDlqIfNeeded = new Choice(this, 'Any Failure?')
      .when(
        Condition.or(
          ...SUPPORTED_LANGUAGES.map((_, i) => Condition.isPresent(`$.${docGenResultsKey}[${i}].error`)),
        ),
        sendToDeadLetterQueue,
      )
      .otherwise(new Succeed(this, 'Success'));

    const definition = new Pass(this, 'Track Execution Infos', {
      inputPath: '$$.Execution',
      parameters: {
        'Id.$': '$.Id',
        'Name.$': '$.Name',
        'RoleArn.$': '$.RoleArn',
        'StartTime.$': '$.StartTime',
      },
      resultPath: '$.$TaskExecution',
    }).next(
      new Parallel(this, 'DocGen', { resultPath: `$.${docGenResultsKey}` })
        .branch(...SUPPORTED_LANGUAGES.map((language) =>
          new tasks.LambdaInvoke(this, `Generate ${language} docs`, {
            lambdaFunction: new Transliterator(this, `DocGen-${language}`, { ...props, language }).function,
            outputPath: '$.result',
            resultSelector: {
              result: {
                'language': language,
                'success.$': '$.Payload',
              },
            },
          }).addRetry({ errors: ['Lambda.TooManyRequestsException'], interval: Duration.seconds(30), maxAttempts: 5 })
            .addCatch(
              new Pass(this, `Generate ${language} docs failure`, { parameters: { 'error.$': 'States.StringToJson($.Cause)', language } }),
            )
            .addCatch(
              new Pass(this, `Generate ${language} docs fault`, { parameters: { 'error.$': '$.Cause', language } }),
              { errors: ['States.ALL'] },
            ),
        ))
        .next(new Choice(this, 'Any Success?')
          .when(
            Condition.or(
              ...SUPPORTED_LANGUAGES.map((_, i) => Condition.isNotPresent(`$.${docGenResultsKey}[${i}].error`)),
            ),
            addToCatalog.next(sendToDlqIfNeeded),
          )
          .otherwise(sendToDlqIfNeeded),
        ));

    this.stateMachine = new StateMachine(this, 'Resource', {
      definition,
      stateMachineType: StateMachineType.STANDARD,
      timeout: Duration.days(1), // Ample time for retries, etc...
      tracingEnabled: true,
    });

    if (props.vpc) {
      // Ensure the State Machine does not get to run before the VPC can be used.
      this.stateMachine.node.addDependency(props.vpc.internetConnectivityEstablished);
    }

    props.monitoring.addHighSeverityAlarm(
      'Backend Orchestration Failed',
      this.stateMachine.metricFailed()
        .createAlarm(this, 'OrchestrationFailed', {
          alarmName: `${this.stateMachine.node.path}/${this.stateMachine.metricFailed().metricName}`,
          alarmDescription: [
            'Backend orchestration failed!',
            '',
            `Direct link to state machine: ${stateMachineUrl(this.stateMachine)}`,
            'Warning: messages that resulted in a failed exectuion will NOT be in the DLQ!',
          ].join('\n'),
          comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          evaluationPeriods: 1,
          threshold: 1,
        }));

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
      tracing: Tracing.ACTIVE,
    });
    props.bucket.grantRead(this.reprocessAllFunction);
    this.stateMachine.grantStartExecution(this.reprocessAllFunction);
  }
}
