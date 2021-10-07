import { ComparisonOperator, MathExpression, Metric, MetricOptions, Statistic, TreatMissingData } from '@aws-cdk/aws-cloudwatch';
import { Effect, IGrantable, IPrincipal, PolicyStatement } from '@aws-cdk/aws-iam';
import { IFunction, Tracing } from '@aws-cdk/aws-lambda';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { IBucket } from '@aws-cdk/aws-s3';
import { IQueue, Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { StateMachine, TaskStateBase, TaskStateBaseProps, FieldUtils, JsonPath, IntegrationPattern, Choice, Succeed, Condition, Map } from '@aws-cdk/aws-stepfunctions';
import { LambdaInvoke } from '@aws-cdk/aws-stepfunctions-tasks';
import { integrationResourceArn } from '@aws-cdk/aws-stepfunctions-tasks/lib/private/task-utils';
import { Construct, Duration } from '@aws-cdk/core';
import { lambdaFunctionUrl, sqsQueueUrl } from '../../deep-link';
import { Monitoring } from '../../monitoring';
import { PackageTagConfig } from '../../package-tag';
import { RUNBOOK_URL } from '../../runbook-url';
import type { PackageLinkConfig } from '../../webapp';
import { Orchestration } from '../orchestration';
import { STORAGE_KEY_PREFIX, METADATA_KEY_SUFFIX, PACKAGE_KEY_SUFFIX } from '../shared/constants';
import { MetricName, METRICS_NAMESPACE } from './constants';
import { Ingestion as Handler } from './ingestion';
import { ReIngest } from './re-ingest';

export interface IngestionProps {
  /**
   * The bucket in which ingested objects are due to be inserted.
   */
  readonly bucket: IBucket;

  /**
   * The monitoring handler to register alarms with.
   */
  readonly monitoring: Monitoring;

  /**
   * The backend orchestration to invoke once the package metadata has been
   * successfully registered.
   */
  readonly orchestration: Orchestration;

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

    const handler = new Handler(this, 'Default', {
      description: '[ConstructHub/Ingestion] Ingests new package versions into the Construct Hub',
      environment: {
        AWS_EMF_ENVIRONMENT: 'Local',
        BUCKET_NAME: props.bucket.bucketName,
        PACKAGE_LINKS: JSON.stringify(props.packageLinks ?? []),
        PACKAGE_TAGS: JSON.stringify(props.packageTags ?? []),
        STATE_MACHINE_ARN: props.orchestration.stateMachine.stateMachineArn,
      },
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 10_240, // Currently the maximum possible setting
      timeout: Duration.minutes(15),
      tracing: Tracing.ACTIVE,
    });
    this.function = handler;

    props.bucket.grantWrite(this.function);
    props.orchestration.stateMachine.grantStartExecution(this.function);

    this.function.addEventSource(new SqsEventSource(this.queue, { batchSize: 1 }));
    // This event source is disabled, and can be used to re-process dead-letter-queue messages
    this.function.addEventSource(new SqsEventSource(this.deadLetterQueue, { batchSize: 1, enabled: false }));


    // Reprocess workflow
    const reprocessQueue = new Queue(this, 'ReprocessQueue', {
      deadLetterQueue: {
        maxReceiveCount: 5,
        queue: this.deadLetterQueue,
      },
      encryption: QueueEncryption.KMS_MANAGED,
      retentionPeriod: this.queueRetentionPeriod,
      visibilityTimeout: Duration.minutes(15),
    });
    props.bucket.grantRead(this.function, `${STORAGE_KEY_PREFIX}*${PACKAGE_KEY_SUFFIX}`);
    this.function.addEventSource(new SqsEventSource(reprocessQueue, { batchSize: 1 }));
    new ReprocessIngestionWorkflow(this, 'ReprocessWorkflow', { bucket: props.bucket, queue: reprocessQueue });

    this.grantPrincipal = this.function.grantPrincipal;

    props.monitoring.addHighSeverityAlarm(
      'Ingestion Dead-Letter Queue not empty',
      new MathExpression({
        expression: 'm1 + m2',
        usingMetrics: {
          m1: this.deadLetterQueue.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(1) }),
          m2: this.deadLetterQueue.metricApproximateNumberOfMessagesNotVisible({ period: Duration.minutes(1) }),
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
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
        // SQS does not emit metrics if the queue has been empty for a while, which is GOOD.
        treatMissingData: TreatMissingData.NOT_BREACHING,
      }),
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
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 2,
        threshold: 1,
        // Lambda only emits metrics when the function is invoked. No invokation => no errors.
        treatMissingData: TreatMissingData.NOT_BREACHING,
      }),
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
   * file and te `.jsii` attribute.
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
}

/**
 * A StepFunctions State Machine to reprocess every currently indexed package
 * through the ingestion function. This should not be frequently required, but
 * can come in handy at times.
 */
class ReprocessIngestionWorkflow extends Construct {
  public constructor(scope: Construct, id: string, props: ReprocessIngestionWorkflowProps) {
    super(scope, id);

    const lambdaFunction = new ReIngest(this, 'Function', {
      description: '[ConstructHub/Ingestion/ReIngest] The function used to reprocess packages through ingestion',
      environment: { BUCKET_NAME: props.bucket.bucketName, QUEUE_URL: props.queue.queueUrl },
      tracing: Tracing.ACTIVE,
    });

    props.queue.grantSendMessages(lambdaFunction);
    props.bucket.grantRead(lambdaFunction, `${STORAGE_KEY_PREFIX}*${METADATA_KEY_SUFFIX}`);
    props.bucket.grantRead(lambdaFunction, `${STORAGE_KEY_PREFIX}*${PACKAGE_KEY_SUFFIX}`);

    const listBucket = new Choice(this, 'Has a NextContinuationToken?')
      .when(Condition.isPresent('$.response.NextContinuationToken'),
        new AwsSdkTask(this, 'S3.ListObjectsV2(NextPage)', {
          service: 's3',
          action: 'listObjectsV2',
          iamAction: 'ListBucket',
          iamResource: props.bucket.bucketArn,
          parameters: {
            Bucket: props.bucket.bucketName,
            ContinuationToken: JsonPath.stringAt('$.response.NextContinuationToken'),
            MaxKeys: 250, // <- Limits the response size, and ensures we don't spawn too many Lambdas at once in the Map state.
            Prefix: STORAGE_KEY_PREFIX,
          },
          resultPath: '$.response',
        }))
      .otherwise(new AwsSdkTask(this, 'S3.ListObjectsV2(FirstPage)', {
        service: 's3',
        action: 'listObjectsV2',
        iamAction: 'ListBucket',
        iamResource: props.bucket.bucketArn,
        parameters: {
          Bucket: props.bucket.bucketName,
          Prefix: STORAGE_KEY_PREFIX,
        },
        resultPath: '$.response',
      })).afterwards();

    const process = new Map(this, 'Process Result', {
      itemsPath: '$.response.Contents',
      resultPath: JsonPath.DISCARD,
    }).iterator(
      new Choice(this, 'Is metadata object?')
        .when(
          Condition.stringMatches('$.Key', `*${METADATA_KEY_SUFFIX}`),
          new LambdaInvoke(this, 'Send for reprocessing', { lambdaFunction })
            // Ample retries here... We should never fail because of throttling....
            .addRetry({ errors: ['Lambda.TooManyRequestsException'], backoffRate: 1.1, interval: Duration.minutes(1), maxAttempts: 30 }),
        )
        .otherwise(new Succeed(this, 'Nothing to do')),
    );

    listBucket.next(process.next(new Choice(this, 'Is there more?')
      .when(Condition.isPresent('$.response.NextContinuationToken'), listBucket)
      .otherwise(new Succeed(this, 'All Done'))));

    const stateMachine = new StateMachine(this, 'StateMachine', {
      definition: listBucket,
      timeout: Duration.hours(1),
    });

    props.bucket.grantRead(stateMachine);
    props.queue.grantSendMessages(stateMachine);
  }
}

/**
 * There is an open PR on CDK to implement this as part of the core framework.
 * This can be removed once that PR lands.
 */
interface AwsSdkTaskProps extends TaskStateBaseProps {
  readonly service: string;
  readonly action: string;
  readonly iamAction?: string;
  readonly iamResource?: string;
  readonly parameters?: { [key: string]: any };
}

class AwsSdkTask extends TaskStateBase {
  public readonly taskMetrics = undefined;

  public constructor(scope: Construct, id: string, private readonly props: AwsSdkTaskProps) {
    super(scope, id, props);
  }

  public get taskPolicies(): PolicyStatement[] {
    return [new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [`${this.props.service}:${this.props.iamAction ?? this.props.action}`],
      resources: [this.props.iamResource ?? '*'],
    })];
  }

  protected _renderTask(): any {
    return {
      Resource: integrationResourceArn(
        'aws-sdk',
        `${this.props.service}:${this.props.action}`,
        this.props.integrationPattern ?? IntegrationPattern.REQUEST_RESPONSE,
      ),
      Parameters: FieldUtils.renderObject(this.props.parameters ?? {}),
    };
  }
}
