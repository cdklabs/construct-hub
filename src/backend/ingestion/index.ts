import { ComparisonOperator, MathExpression, Metric, MetricOptions, Statistic, TreatMissingData } from '@aws-cdk/aws-cloudwatch';
import { IGrantable, IPrincipal } from '@aws-cdk/aws-iam';
import { FunctionProps, IFunction, Tracing } from '@aws-cdk/aws-lambda';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { BlockPublicAccess, Bucket, IBucket } from '@aws-cdk/aws-s3';
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment';
import { IQueue, Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { StateMachine, JsonPath, Choice, Succeed, Condition, Map } from '@aws-cdk/aws-stepfunctions';
import { CallAwsService, LambdaInvoke } from '@aws-cdk/aws-stepfunctions-tasks';
import { Construct, Duration } from '@aws-cdk/core';
import { Repository } from '../../codeartifact/repository';
import { ConfigFile } from '../../config-file';
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

    const configFilename = 'config.json';
    const config = new ConfigFile(configFilename, JSON.stringify({
      packageLinks: props.packageLinks ?? [],
      packageTags: props.packageTags ?? [],
    }));

    const configBucket = new Bucket(this, 'ConfigBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
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
      environment.CODE_ARTIFACT_REPOSITORY_ENDPOINT = props.codeArtifact.repositoryNpmEndpoint;
      environment.CODE_ARTIFACT_DOMAIN_NAME = props.codeArtifact.repositoryDomainName;
      environment.CODE_ARTIFACT_DOMAIN_OWNER = props.codeArtifact.repositoryDomainOwner;
    }

    const handler = new Handler(this, 'Default', {
      description: '[ConstructHub/Ingestion] Ingests new package versions into the Construct Hub',
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
      // Visibility timeout of 15 minutes matches the Lambda maximum execution time.
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
 *
 * For more information, refer to the runbook at
 * https://github.com/cdklabs/construct-hub/blob/main/docs/operator-runbook.md
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
        new CallAwsService(this, 'S3.ListObjectsV2(NextPage)', {
          service: 's3',
          action: 'listObjectsV2',
          iamAction: 's3:ListBucket',
          iamResources: [props.bucket.bucketArn],
          parameters: {
            Bucket: props.bucket.bucketName,
            ContinuationToken: JsonPath.stringAt('$.response.NextContinuationToken'),
            MaxKeys: 250, // <- Limits the response size, and ensures we don't spawn too many Lambdas at once in the Map state.
            Prefix: STORAGE_KEY_PREFIX,
          },
          resultPath: '$.response',
        }))
      .otherwise(new CallAwsService(this, 'S3.ListObjectsV2(FirstPage)', {
        service: 's3',
        action: 'listObjectsV2',
        iamAction: 's3:ListBucket',
        iamResources: [props.bucket.bucketArn],
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
