import { Metric, MetricOptions, Statistic } from '@aws-cdk/aws-cloudwatch';
import { IGrantable, IPrincipal } from '@aws-cdk/aws-iam';
import { IFunction } from '@aws-cdk/aws-lambda';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { IBucket } from '@aws-cdk/aws-s3';
import { IQueue, Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { Construct, Duration } from '@aws-cdk/core';
import { Monitoring } from '../../monitoring';
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

  public readonly queueRetentionPeriod = Duration.days(14);

  public readonly function: IFunction;

  public constructor(scope: Construct, id: string, props: IngestionProps) {
    super(scope, id);

    this.queue = new Queue(this, 'Queue', {
      encryption: QueueEncryption.KMS_MANAGED,
      retentionPeriod: this.queueRetentionPeriod,
      visibilityTimeout: Duration.minutes(15),
    });

    const handler = new Handler(this, 'Default', {
      description: 'Ingests new package versions into the Construct Hub',
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        STATE_MACHINE_ARN: props.orchestration.stateMachine.stateMachineArn,
      },
      memorySize: 10_240, // Currently the maximum possible setting
      timeout: Duration.minutes(15),
    });
    this.function = handler;

    props.bucket.grantWrite(this.function);
    props.orchestration.stateMachine.grantStartExecution(this.function);

    this.function.addEventSource(new SqsEventSource(this.queue, { batchSize: 1 }));

    this.grantPrincipal = this.function.grantPrincipal;

    props.monitoring.watchful.watchLambdaFunction('Ingestion Function', handler);
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
