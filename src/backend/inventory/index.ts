import { Metric, MetricOptions, Statistic } from '@aws-cdk/aws-cloudwatch';
import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { IBucket } from '@aws-cdk/aws-s3';
import { Construct, Duration } from '@aws-cdk/core';
import { Monitoring } from '../../monitoring';
import { Canary } from './canary';
import { METRICS_NAMESPACE, MetricName } from './constants';

export interface InventoryProps {
  /**
   * The data storage bucket.
   */
  readonly bucket: IBucket;

  /**
   * The `Monitoring` instance to use for reporting this canary's health.
   */
  readonly monitoring: Monitoring;

  /**
   * How long should canary logs be retained?
   */
  readonly logRetention?: RetentionDays;

  /**
   * The rate at which the canary should run.
   *
   * @default Duration.minutes(5)
   */
  readonly scheduleRate?: Duration;
}

/**
 * Periodically computes an inventory of all indexed packages into the storage
 * bucket, and produces metrics with an overview of the index' state.
 */
export class Inventory extends Construct {
  private readonly canary: Canary;

  public constructor(scope: Construct, id: string, props: InventoryProps) {
    super(scope, id);

    const rate = props.scheduleRate ?? Duration.minutes(5);

    this.canary = new Canary(this, 'Resource', {
      description: '[ConstructHub/Inventory] A canary that periodically inspects the list of indexed packages',
      environment: { BUCKET_NAME: props.bucket.bucketName },
      logRetention: props.logRetention,
      memorySize: 10_240,
      timeout: rate,
    });
    const grant = props.bucket.grantRead(this.canary);

    new Rule(this, 'ScheduleRule', {
      schedule: Schedule.rate(rate),
      targets: [new LambdaFunction(this.canary)],
    }).node.addDependency(grant);

    props.monitoring.watchful.watchLambdaFunction('Inventory Canary', this.canary);
  }

  public metricMissingPackageMetadataCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.MISSING_METADATA_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricMissingAssemblyCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.MISSING_ASSEMBLY_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricPackageCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.PACKAGE_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricPackageMajorCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.PACKAGE_MAJOR_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricPackageVersionCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.PACKAGE_VERSION_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricMissingPythonDocsCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.MISSING_PYTHON_DOCS_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricMissingTypeScriptDocsCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.MISSING_PYTHON_DOCS_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricMissingPackageTarballCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.MISSING_TARBALL_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricSubmoduleCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.SUBMODULE_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricUnknownObjectCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.UNKNOWN_OBJECT_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }
}
