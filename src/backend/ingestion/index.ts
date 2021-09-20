import { ComparisonOperator, MathExpression, Metric, MetricOptions, Statistic, TreatMissingData } from '@aws-cdk/aws-cloudwatch';
import { IGrantable, IPrincipal } from '@aws-cdk/aws-iam';
import { IFunction, Tracing } from '@aws-cdk/aws-lambda';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { IBucket } from '@aws-cdk/aws-s3';
import { IQueue, Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { Construct, Duration } from '@aws-cdk/core';
import { lambdaFunctionUrl, sqsQueueUrl } from '../../deep-link';
import { Monitoring } from '../../monitoring';
import { RUNBOOK_URL } from '../../runbook-url';
import type { PackageLinkConfig } from '../../webapp';
import { Orchestration } from '../orchestration';
import { MetricName, METRICS_NAMESPACE } from './constants';
import { Ingestion as Handler } from './ingestion';

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
        BUCKET_NAME: props.bucket.bucketName,
        STATE_MACHINE_ARN: props.orchestration.stateMachine.stateMachineArn,
        PACKAGE_LINKS: JSON.stringify(props.packageLinks ?? []),
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
