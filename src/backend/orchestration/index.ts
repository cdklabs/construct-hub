import { ComparisonOperator, MathExpression, MathExpressionOptions, Metric, MetricOptions, Statistic } from '@aws-cdk/aws-cloudwatch';
import { SubnetSelection, Vpc } from '@aws-cdk/aws-ec2';
import { Cluster, ICluster } from '@aws-cdk/aws-ecs';
import { IFunction, Tracing } from '@aws-cdk/aws-lambda';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { IBucket } from '@aws-cdk/aws-s3';
import { IQueue, Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { Choice, Condition, IStateMachine, JsonPath, Parallel, Pass, StateMachine, StateMachineType, Succeed, TaskInput } from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import { Construct, Duration } from '@aws-cdk/core';
import { Repository } from '../../codeartifact/repository';
import { sqsQueueUrl, stateMachineUrl } from '../../deep-link';
import { Monitoring } from '../../monitoring';
import { RUNBOOK_URL } from '../../runbook-url';
import { CatalogBuilder } from '../catalog-builder';
import { DenyList } from '../deny-list';
import { DocumentationLanguage } from '../shared/language';
import { Transliterator, TransliteratorVpcEndpoints } from '../transliterator';
import { RedriveStateMachine } from './redrive-state-machine';
import { ReprocessAll } from './reprocess-all';

const SUPPORTED_LANGUAGES = [DocumentationLanguage.PYTHON, DocumentationLanguage.TYPESCRIPT, DocumentationLanguage.JAVA];

/**
 * This retry policy is used for all items in the state machine and allows ample
 * retry attempts in order to avoid having to implement a custom backpressure
 * handling mehanism.
 *
 * This is meant as a stop-gap until we can implement a more resilient system,
 * which likely will involve more SQS queues, but will probably need to be
 * throughoutly vetted before it is rolled out everywhere.
 *
 * After 30 attempts, given the parameters, the last attempt will wait just
 * under 16 minutes, which should be enough for currently running Lambda
 * functions to complete (or time out after 15 minutes). The total time spent
 * waiting between retries by this time is just over 3 hours. This is a lot of
 * time, but in extreme burst situations (i.e: reprocessing everything), this
 * is actually a good thing.
 */
const THROTTLE_RETRY_POLICY = { backoffRate: 1.1, interval: Duration.minutes(1), maxAttempts: 30 };

export interface OrchestrationProps {
  /**
   * The bucket in which to source assemblies to transliterate.
   */
  readonly bucket: IBucket;

  /**
   * The CodeArtifact registry to use for regular operations.
   */
  readonly codeArtifact?: Repository;

  /**
   * The monitoring handler to register alarms with.
   */
  readonly monitoring: Monitoring;

  /**
   * The VPC in which to place networked resources.
   */
  readonly vpc?: Vpc;

  /**
   * The VPC subnet selection to use.
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * VPC endpoints to use for interacting with CodeArtifact and S3.
   */
  readonly vpcEndpoints?: TransliteratorVpcEndpoints;

  /**
   * How long should execution logs be retained?
   *
   * @default RetentionDays.TEN_YEARS
   */
  readonly logRetention?: RetentionDays;

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

  /**
   * The ECS cluster used to run tasks.
   */
  public readonly ecsCluster: ICluster;

  /**
   * The transliterator used by this orchestration workflow.
   */
  public readonly transliterator: Transliterator;

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
        label: 'Dead-Letter Queue not empty',
        usingMetrics: {
          m1: this.deadLetterQueue.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(1) }),
          m2: this.deadLetterQueue.metricApproximateNumberOfMessagesNotVisible({ period: Duration.minutes(1) }),
        },
      }).createAlarm(this, 'DLQAlarm', {
        alarmName: `${this.deadLetterQueue.node.path}/NotEmpty`,
        alarmDescription: [
          'Backend orchestration dead-letter queue is not empty.',
          '',
          `RunBook: ${RUNBOOK_URL}`,
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
      .addRetry({ errors: ['Lambda.TooManyRequestsException'], ...THROTTLE_RETRY_POLICY })
      .addCatch(
        new Pass(this, '"Add to catalog.json" throttled', {
          parameters: { 'error.$': '$.Cause' },
          resultPath: '$.error',
        }).next(sendToDeadLetterQueue),
        { errors: ['Lambda.TooManyRequestsException'] },
      )
      .addCatch(
        new Pass(this, '"Add to catalog.json" failure', {
          parameters: { 'error.$': 'States.StringToJson($.Cause)' },
          resultPath: '$.error',
        }).next(sendToDeadLetterQueue),
        { errors: ['States.TaskFailed'] },
      )
      .addCatch(new Pass(this, '"Add to catalog.json" fault', {
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

    this.ecsCluster = new Cluster(this, 'Cluster', {
      containerInsights: true,
      enableFargateCapacityProviders: true,
      vpc: props.vpc,
    });

    this.transliterator = new Transliterator(this, 'Transliterator', props);

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
        .branch(...SUPPORTED_LANGUAGES.map((language) => {

          // We have to prepare the input to be a JSON string, within an array, because the ECS task integration expects
          // an array of strings (the model if that of a CLI invocation).
          // Unfortunately, we have to split this in two Pass states, because I don't know how to make it work otherwise.
          return new Pass(this, `Prepare ${language}`, {
            parameters: { command: { 'bucket.$': '$.bucket', 'assembly.$': '$.assembly', '$TaskExecution.$': '$.$TaskExecution' } },
            resultPath: '$',
          })
            .next(new Pass(this, `Stringify ${language} input`, {
              parameters: { 'commands.$': 'States.Array(States.JsonToString($.command))' },
              resultPath: '$',
            })
              .next(this.transliterator.createEcsRunTask(this, `Generate ${language} docs`, {
                cluster: this.ecsCluster,
                inputPath: '$.commands',
                language,
                resultSelector: { result: { 'language': language, 'success.$': '$' } },
                vpcSubnets: props.vpcSubnets,
              })
                // Do not retry NoSpaceLeftOnDevice errors, these are typically not transient.
                .addRetry({ errors: ['jsii-docgen.NoSpaceLeftOnDevice'], maxAttempts: 0 })
                .addRetry({
                  errors: [
                    'ECS.AmazonECSException', // Task failed starting, usually due to throttle / out of capacity
                    'jsii-docgen.NpmError.E429', // HTTP 429 ("Too Many Requests") from CodeArtifact's S3 bucket
                    'jsii-codgen.NpmError.EPROTO', // Sporadic TLS negotiation failures we see in logs, transient
                  ],
                  ...THROTTLE_RETRY_POLICY,
                })
                .addRetry({ maxAttempts: 3 })
                .addCatch(
                  new Pass(this, `"Generate ${language} docs" timed out`, { parameters: { error: 'Timed out!', language } }),
                  { errors: ['States.Timeout'] },
                )
                .addCatch(
                  new Pass(this, `"Generate ${language} docs" service error`, { parameters: { 'error.$': '$.Cause', language } }),
                  { errors: ['ECS.AmazonECSException'] },
                )
                .addCatch(
                  new Pass(this, `"Generate ${language} docs" failure`, { parameters: { 'error.$': 'States.StringToJson($.Cause)', language } }),
                  { errors: ['States.TaskFailed'] },
                )
                .addCatch(
                  new Pass(this, `"Generate ${language} docs" fault`, { parameters: { 'error.$': '$.Cause', language } }),
                  { errors: ['States.ALL'] },
                )));
        }))
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
            `RunBook: ${RUNBOOK_URL}`,
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

  public metricEcsTaskCount(opts: MetricOptions): Metric {
    return new Metric({
      statistic: Statistic.SUM,
      ...opts,
      dimensionsMap: { ClusterName: this.ecsCluster.clusterName },
      metricName: 'TaskCount',
      namespace: 'ECS/ContainerInsights',
    });
  }

  public metricEcsCpuReserved(opts?: MetricOptions): Metric {
    return new Metric({
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensionsMap: { ClusterName: this.ecsCluster.clusterName },
      metricName: 'CpuReserved',
      namespace: 'ECS/ContainerInsights',
    });
  }

  public metricEcsCpuUtilized(opts?: MetricOptions): Metric {
    return new Metric({
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensionsMap: { ClusterName: this.ecsCluster.clusterName },
      metricName: 'CpuUtilized',
      namespace: 'ECS/ContainerInsights',
    });
  }

  public metricEcsCpuUtilization(opts?: MathExpressionOptions): MathExpression {
    return new MathExpression({
      ...opts,
      // Calculates the % CPU utilization from the CPU units utilization &
      // reservation. FILL is used to make a non-sparse time-series (the metrics
      // are not emitted if no task runs)
      expression: '100 * FILL(mCpuUtilized, 0) / FILL(mCpuReserved, REPEAT)',
      usingMetrics: {
        mCpuReserved: this.metricEcsCpuReserved(),
        mCpuUtilized: this.metricEcsCpuUtilized(),
      },
    });
  }

  public metricEcsMemoryReserved(opts?: MetricOptions): Metric {
    return new Metric({
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensionsMap: { ClusterName: this.ecsCluster.clusterName },
      metricName: 'MemoryReserved',
      namespace: 'ECS/ContainerInsights',
    });
  }

  public metricEcsMemoryUtilized(opts?: MetricOptions): Metric {
    return new Metric({
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensionsMap: { ClusterName: this.ecsCluster.clusterName },
      metricName: 'MemoryUtilized',
      namespace: 'ECS/ContainerInsights',
    });
  }

  public metricEcsMemoryUtilization(opts?: MathExpressionOptions): MathExpression {
    return new MathExpression({
      ...opts,
      // Calculates the % memory utilization from the RAM utilization &
      // reservation. FILL is used to make a non-sparse time-series (the metrics
      // are not emitted if no task runs)
      expression: '100 * FILL(mMemoryUtilized, 0) / FILL(mMemoryReserved, REPEAT)',
      usingMetrics: {
        mMemoryReserved: this.metricEcsMemoryReserved(),
        mMemoryUtilized: this.metricEcsMemoryUtilized(),
      },
    });
  }

  public metricEcsNetworkRxBytes(opts?: MetricOptions): Metric {
    return new Metric({
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensionsMap: { ClusterName: this.ecsCluster.clusterName },
      metricName: 'NetworkRxBytes',
      namespace: 'ECS/ContainerInsights',
    });
  }

  public metricEcsNetworkTxBytes(opts?: MetricOptions): Metric {
    return new Metric({
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensionsMap: { ClusterName: this.ecsCluster.clusterName },
      metricName: 'NetworkTxBytes',
      namespace: 'ECS/ContainerInsights',
    });
  }
}
