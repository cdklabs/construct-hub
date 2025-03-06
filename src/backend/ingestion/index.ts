import { Duration, Stack, ArnFormat } from 'aws-cdk-lib';
import {
  ComparisonOperator,
  MathExpression,
  Metric,
  MetricOptions,
  Statistic,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { Rule, RuleTargetInput, Schedule } from 'aws-cdk-lib/aws-events';
import { SfnStateMachine } from 'aws-cdk-lib/aws-events-targets';
import { IGrantable, IPrincipal } from 'aws-cdk-lib/aws-iam';
import { FunctionProps, IFunction, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, IBucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { IQueue, Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import {
  StateMachine,
  JsonPath,
  Choice,
  Condition,
  Map,
  TaskInput,
  IntegrationPattern,
  Wait,
  WaitTime,
} from 'aws-cdk-lib/aws-stepfunctions';
import {
  CallAwsService,
  LambdaInvoke,
  StepFunctionsStartExecution,
} from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { MetricName, METRICS_NAMESPACE } from './constants';
import { Ingestion as Handler } from './ingestion';
import { ReIngest } from './re-ingest';
import { Repository } from '../../codeartifact/repository';
import {
  lambdaFunctionUrl,
  sqsQueueUrl,
  stateMachineUrl,
} from '../../deep-link';
import { Monitoring } from '../../monitoring';
import { OverviewDashboard } from '../../overview-dashboard';
import { PackageTagConfig } from '../../package-tag';
import { RUNBOOK_URL } from '../../runbook-url';
import { S3StorageFactory } from '../../s3/storage';
import { TempFile } from '../../temp-file';
import type { PackageLinkConfig } from '../../webapp';
import { gravitonLambdaIfAvailable } from '../_lambda-architecture';
import { Orchestration } from '../orchestration';
import {
  STORAGE_KEY_PREFIX,
  METADATA_KEY_SUFFIX,
  PACKAGE_KEY_SUFFIX,
} from '../shared/constants';

export interface IngestionProps {
  /**
   * The bucket in which ingested objects are due to be inserted.
   */
  readonly bucket: IBucket;

  /**
   * The CodeArtifact repository to which packages should be published. This is
   * the ConstructHub internal CodeArtifact repository, if one exists.
   */
  readonly codeArtifact?: Repository;

  /**
   * The monitoring handler to register alarms with.
   */
  readonly monitoring: Monitoring;

  /**
   * The backend orchestration to invoke once the package metadata has been
   * successfully registered.
   */
  readonly orchestration: Orchestration;

  readonly overviewDashboard: OverviewDashboard;

  /**
   * How long to retain the CloudWatch logs.
   *
   * @default RetentionDays.TEN_YEARS
   */
  readonly logRetention?: RetentionDays;

  /**
   * Configuration for custom package page links.
   */
  readonly packageLinks?: PackageLinkConfig[];

  /**
   * Serialized configuration for custom package tags.
   */
  readonly packageTags?: PackageTagConfig[];

  /**
   * How frequently all packages should get fully reprocessed.
   *
   * See the operator runbook for more information about reprocessing.
   * @see https://github.com/cdklabs/construct-hub/blob/main/docs/operator-runbook.md
   *
   * @default - never
   */
  readonly reprocessFrequency?: Duration;

  /**
   * Package versions that have been published before this time window will not be reprocessed.
   *
   * @default Duration.days(90)
   */
  readonly reprocessAge?: Duration;

  /**
   * The SQS queue where new package will be added to fetch release notes.
   */
  readonly releaseNotesFetchQueue?: IQueue;
}

/**
 * The ingestion function receives messages from discovery integrations and
 * processes their payloads into the provided S3 Bucket.
 *
 * This function is also an `IGrantable`, so that it can be granted permissions
 * to read from the source S3 buckets.
 */
export class Ingestion extends Construct implements IGrantable {
  public readonly grantPrincipal: IPrincipal;

  /**
   * The SQS queue that triggers the ingestion function.
   */
  public readonly queue: IQueue;

  /**
   * The ingestion dead letter queue, which will hold messages that failed
   * ingestion one too many times, so that poison pills don't endlessly consume
   * resources.
   */
  public readonly deadLetterQueue: IQueue;

  public readonly queueRetentionPeriod = Duration.days(14);

  public readonly function: IFunction;

  public constructor(scope: Construct, id: string, props: IngestionProps) {
    super(scope, id);

    this.deadLetterQueue = new Queue(this, 'DLQ', {
      encryption: QueueEncryption.KMS_MANAGED,
      retentionPeriod: this.queueRetentionPeriod,
      visibilityTimeout: Duration.minutes(15),
    });

    this.queue = new Queue(this, 'Queue', {
      deadLetterQueue: {
        maxReceiveCount: 5,
        queue: this.deadLetterQueue,
      },
      encryption: QueueEncryption.KMS_MANAGED,
      retentionPeriod: this.queueRetentionPeriod,
      visibilityTimeout: Duration.minutes(15),
    });

    const configFilename = 'config.json';
    const config = new TempFile(
      configFilename,
      JSON.stringify({
        packageLinks: props.packageLinks ?? [],
        packageTags: props.packageTags ?? [],
      })
    );

    const storageFactory = S3StorageFactory.getOrCreate(this);
    const configBucket = storageFactory.newBucket(this, 'ConfigBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
    });

    new BucketDeployment(this, 'DeployIngestionConfiguration', {
      sources: [Source.asset(config.dir)],
      destinationBucket: configBucket,
    });

    const environment: FunctionProps['environment'] = {
      AWS_EMF_ENVIRONMENT: 'Local',
      BUCKET_NAME: props.bucket.bucketName,
      CONFIG_BUCKET_NAME: configBucket.bucketName,
      CONFIG_FILE_KEY: configFilename,
      STATE_MACHINE_ARN: props.orchestration.stateMachine.stateMachineArn,
    };

    if (props.codeArtifact) {
      environment.CODE_ARTIFACT_REPOSITORY_ENDPOINT =
        props.codeArtifact.publishingRepositoryNpmEndpoint;
      environment.CODE_ARTIFACT_DOMAIN_NAME =
        props.codeArtifact.repositoryDomainName;
      environment.CODE_ARTIFACT_DOMAIN_OWNER =
        props.codeArtifact.repositoryDomainOwner;
    }

    if (props.releaseNotesFetchQueue) {
      environment.RELEASE_NOTES_FETCH_QUEUE_URL =
        props.releaseNotesFetchQueue.queueUrl;
    }

    const handler = new Handler(this, 'Default', {
      description:
        '[ConstructHub/Ingestion] Ingests new package versions into the Construct Hub',
      environment,
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 10_240, // Currently the maximum possible setting
      timeout: Duration.minutes(15),
      tracing: Tracing.ACTIVE,
    });
    this.function = handler;

    configBucket.grantRead(handler);
    props.bucket.grantWrite(this.function);
    props.codeArtifact?.grantPublishToRepository(handler);
    props.orchestration.stateMachine.grantStartExecution(this.function);

    this.function.addEventSource(
      new SqsEventSource(this.queue, { batchSize: 1 })
    );
    // This event source is disabled, and can be used to re-process dead-letter-queue messages
    this.function.addEventSource(
      new SqsEventSource(this.deadLetterQueue, { batchSize: 1, enabled: false })
    );

    if (props.releaseNotesFetchQueue) {
      props.releaseNotesFetchQueue.grantSendMessages(this.function);
    }

    // Reprocess workflow
    const reprocessQueue = new Queue(this, 'ReprocessQueue', {
      deadLetterQueue: {
        maxReceiveCount: 5,
        queue: this.deadLetterQueue,
      },
      encryption: QueueEncryption.KMS_MANAGED,
      retentionPeriod: this.queueRetentionPeriod,
      // Visibility timeout of 15 minutes matches the Lambda maximum execution time.
      visibilityTimeout: Duration.minutes(15),
    });
    props.bucket.grantRead(
      this.function,
      `${STORAGE_KEY_PREFIX}*${PACKAGE_KEY_SUFFIX}`
    );
    this.function.addEventSource(
      new SqsEventSource(reprocessQueue, { batchSize: 1 })
    );
    const reprocessWorkflow = new ReprocessIngestionWorkflow(
      this,
      'ReprocessWorkflow',
      {
        bucket: props.bucket,
        queue: reprocessQueue,
        reprocessAge: props.reprocessAge ?? Duration.days(90),
      }
    );

    // Run reprocess workflow on a daily basis
    const updatePeriod = props.reprocessFrequency;
    if (updatePeriod) {
      const rule = new Rule(this, 'ReprocessCronJob', {
        schedule: Schedule.rate(updatePeriod),
        description: 'Periodically reprocess all packages',
      });
      rule.addTarget(
        new SfnStateMachine(reprocessWorkflow.stateMachine, {
          input: RuleTargetInput.fromObject({
            comment: 'Scheduled reprocessing event from cron job.',
          }),
        })
      );
    }

    this.grantPrincipal = this.function.grantPrincipal;

    props.monitoring.addLowSeverityAlarm(
      'Ingestion Dead-Letter Queue not empty',
      new MathExpression({
        expression: 'm1 + m2',
        usingMetrics: {
          m1: this.deadLetterQueue.metricApproximateNumberOfMessagesVisible({
            period: Duration.minutes(1),
          }),
          m2: this.deadLetterQueue.metricApproximateNumberOfMessagesNotVisible({
            period: Duration.minutes(1),
          }),
        },
      }).createAlarm(this, 'DLQAlarm', {
        alarmName: `${this.node.path}/DLQNotEmpty`,
        alarmDescription: [
          'The dead-letter queue for the Ingestion function is not empty!',
          '',
          `RunBook: ${RUNBOOK_URL}`,
          '',
          `Direct link to the queue: ${sqsQueueUrl(this.deadLetterQueue)}`,
          `Direct link to the function: ${lambdaFunctionUrl(this.function)}`,
        ].join('\n'),
        comparisonOperator:
          ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 2,
        threshold: 1,
        // SQS does not emit metrics if the queue has been empty for a while, which is GOOD.
        treatMissingData: TreatMissingData.NOT_BREACHING,
      })
    );

    props.overviewDashboard.addDLQMetricToDashboard(
      'Ingestion DLQ',
      this.deadLetterQueue
    );
    props.monitoring.addHighSeverityAlarm(
      'Ingestion failures',
      this.function.metricErrors().createAlarm(this, 'FailureAlarm', {
        alarmName: `${this.node.path}/Failure`,
        alarmDescription: [
          'The Ingestion function is failing!',
          '',
          `RunBook: ${RUNBOOK_URL}`,
          '',
          `Direct link to the function: ${lambdaFunctionUrl(this.function)}`,
        ].join('\n'),
        comparisonOperator:
          ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 2,
        threshold: 1,
        // Lambda only emits metrics when the function is invoked. No invokation => no errors.
        treatMissingData: TreatMissingData.NOT_BREACHING,
      })
    );

    props.monitoring.addLowSeverityAlarm(
      'Reprocessing workflow failures',
      reprocessWorkflow.stateMachine
        .metricFailed()
        .createAlarm(this, 'ReprocessingFailureAlarm', {
          alarmName: `${reprocessWorkflow.node.path}/Failure`,
          alarmDescription: [
            'The Reprocessing workflow is failing!',
            '',
            `RunBook: ${RUNBOOK_URL}`,
            '',
            `Direct link to the state machine: ${stateMachineUrl(
              reprocessWorkflow.stateMachine
            )}`,
          ].join('\n'),
          comparisonOperator:
            ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          evaluationPeriods: 2,
          threshold: 1,
        })
    );

    props.overviewDashboard.addConcurrentExecutionMetricToDashboard(
      handler,
      'IngestionLambda'
    );
  }

  public metricFoundLicenseFile(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.FOUND_LICENSE_FILE,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricIneligibleLicense(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.INELIGIBLE_LICENSE,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricInvalidAssembly(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.INVALID_ASSEMBLY,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricInvalidTarball(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.INVALID_TARBALL,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * This metrics is the total count of packages that were rejected due to
   * mismatched identity (name, version, license) between the `package.json`
   * file and the `.jsii` attribute.
   */
  public metricMismatchedIdentityRejections(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      metricName: MetricName.MISMATCHED_IDENTITY_REJECTIONS,
      namespace: METRICS_NAMESPACE,
    });
  }
}

interface ReprocessIngestionWorkflowProps {
  readonly bucket: IBucket;
  readonly queue: IQueue;
  readonly reprocessAge: Duration;
}

/**
 * A StepFunctions State Machine to reprocess every currently indexed package
 * through the ingestion function. This should not be frequently required, but
 * can come in handy at times.
 *
 * For more information, refer to the runbook at
 * https://github.com/cdklabs/construct-hub/blob/main/docs/operator-runbook.md
 */
class ReprocessIngestionWorkflow extends Construct {
  public readonly stateMachine: StateMachine;

  public constructor(
    scope: Construct,
    id: string,
    props: ReprocessIngestionWorkflowProps
  ) {
    super(scope, id);

    const lambdaFunction = new ReIngest(this, 'Function', {
      architecture: gravitonLambdaIfAvailable(this),
      description:
        '[ConstructHub/Ingestion/ReIngest] The function used to reprocess packages through ingestion',
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        QUEUE_URL: props.queue.queueUrl,
        REPROCESS_AGE_MILLIS: `${props.reprocessAge.toMilliseconds()}`,
      },
      memorySize: 10_240,
      tracing: Tracing.ACTIVE,
      timeout: Duration.minutes(3),
    });

    props.queue.grantSendMessages(lambdaFunction);
    props.bucket.grantRead(
      lambdaFunction,
      `${STORAGE_KEY_PREFIX}*${METADATA_KEY_SUFFIX}`
    );
    props.bucket.grantRead(
      lambdaFunction,
      `${STORAGE_KEY_PREFIX}*${PACKAGE_KEY_SUFFIX}`
    );

    // Need to physical-name the state machine so it can self-invoke.
    const stateMachineName = stateMachineNameFrom(this.node.path);

    const listObjects = (name: string, token?: string) =>
      new CallAwsService(this, name, {
        service: 's3',
        action: 'listObjectsV2',
        iamAction: 's3:ListBucket',
        iamResources: [props.bucket.bucketArn],
        parameters: {
          Bucket: props.bucket.bucketName,
          ContinuationToken: token,
          Prefix: STORAGE_KEY_PREFIX,
          // A bit lower than the 1000 limit, to avoid getting responses
          // that are too large for StepFunctions to handle.
          MaxKeys: 900,
        },
        resultPath: '$.response',
      }).addRetry({ errors: ['S3.SdkClientException'] });

    const listBucket = new Choice(this, 'Has a ContinuationToken?')
      .when(
        Condition.isPresent('$.ContinuationToken'),
        listObjects(
          'S3.ListObjectsV2(NextPage)',
          JsonPath.stringAt('$.ContinuationToken')
        )
      )
      .otherwise(listObjects('S3.ListObjectsV2(FirstPage)'))
      .afterwards();

    const process = new Map(this, 'Process Result', {
      inputPath: `$.response.Contents[*][?(@.Key =~ /^.*${METADATA_KEY_SUFFIX}$/)]`,
      resultPath: JsonPath.DISCARD,
    }).iterator(
      new LambdaInvoke(this, 'Send for reprocessing', { lambdaFunction })
        // Ample retries here... We should never fail because of throttling....
        .addRetry({
          errors: ['Lambda.TooManyRequestsException'],
          backoffRate: 1.1,
          interval: Duration.minutes(1),
          maxAttempts: 30,
        })
    );

    listBucket.next(
      new Choice(this, 'Is there more?')
        .when(
          Condition.isPresent('$.response.NextContinuationToken'),

          new Wait(this, 'Give room for on-demand work', {
            // Sleep a little before enqueuing the next batch, so that we leave room in the worker
            // pool for handling on-demand work. If we don't do this, 60k items will be queued at
            // once and live updates from NPM will struggle to get in in a reasonable time.
            time: WaitTime.duration(waitTimeBetweenReprocessBatches()),
          }).next(
            new StepFunctionsStartExecution(this, 'Continue as new', {
              associateWithParent: true,
              stateMachine: StateMachine.fromStateMachineArn(
                this,
                'ThisStateMachine',
                Stack.of(this).formatArn({
                  arnFormat: ArnFormat.COLON_RESOURCE_NAME,
                  service: 'states',
                  resource: 'stateMachine',
                  resourceName: stateMachineName,
                })
              ),
              input: TaskInput.fromObject({
                ContinuationToken: JsonPath.stringAt(
                  '$.response.NextContinuationToken'
                ),
              }),
              integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
              resultPath: JsonPath.DISCARD,
            }).addRetry({ errors: ['StepFunctions.ExecutionLimitExceeded'] })
          )
        )
        .afterwards({ includeOtherwise: true })
        .next(process)
    );

    this.stateMachine = new StateMachine(this, 'StateMachine', {
      definition: listBucket,
      stateMachineName,
      timeout: Duration.hours(1),
    });

    props.bucket.grantRead(this.stateMachine);
    props.queue.grantSendMessages(this.stateMachine);
  }
}

/**
 * This turns a node path into a valid state machine name, to try and improve
 * the StepFunction's AWS console experience while minimizing the risk for
 * collisons.
 */
function stateMachineNameFrom(nodePath: string): string {
  // Poor man's replace all...
  return nodePath.split(/[^a-z0-9+!@.()=_'-]+/i).join('.');
}

/**
 * The time we wait between enqueueing different batches of the reprocessing machine
 */
function waitTimeBetweenReprocessBatches() {
  // Average time per ECS task. We don've have statistics on this, but
  // can be roughly derived from:

  // Every day we process about 60k items with 1000 workers in 4 hours.
  // 4 hours / (60_000 / 1000) ~= 4 minutes
  const avgTimePerTask = Duration.minutes(4);

  // How many objects are returned by 'listObjectsV2', per call
  const batchSize = 1000;

  // How many workers we have at our disposal
  const workers = 1000;

  // The step functions state machine can't instantaneously start all 1000
  // tasks, they are staggered over time -- so in practice the average load a
  // single batch puts on the ECS cluster at any point in time is a lot lower.
  const sfnStaggerFactor = 0.05;

  // What fraction of capacity [0..1) we want to keep available for on-demand
  // work, while reprocessing.
  const marginFrac = 0.2;

  const seconds =
    ((avgTimePerTask.toSeconds() * sfnStaggerFactor) / (1 - marginFrac)) *
    (batchSize / workers);
  return Duration.seconds(Math.floor(seconds));
}
