import { ComparisonOperator, Metric, MetricOptions, Statistic } from '@aws-cdk/aws-cloudwatch';
import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { IFunction } from '@aws-cdk/aws-lambda';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { IBucket } from '@aws-cdk/aws-s3';
import { Construct, Duration } from '@aws-cdk/core';
import { lambdaFunctionUrl } from '../../deep-link';
import { Monitoring } from '../../monitoring';
import { OverviewDashboard } from '../../overview-dashboard';
import { RUNBOOK_URL } from '../../runbook-url';
import { MISSING_DOCUMENTATION_REPORT_PATTERN, UNINSTALLABLE_PACKAGES_REPORT, CORRUPT_ASSEMBLY_REPORT_PATTERN } from '../shared/constants';
import { DocumentationLanguage } from '../shared/language';
import { Canary } from './canary';
import { METRICS_NAMESPACE, MetricName, LANGUAGE_DIMENSION } from './constants';

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
   * The overview dashboard to add widgets to.
   */
  readonly overviewDashboard: OverviewDashboard;

  /**
   * How long should canary logs be retained?
   */
  readonly logRetention?: RetentionDays;

  /**
   * The rate at which the canary should run.
   *
   * @default Duration.minutes(15)
   */
  readonly scheduleRate?: Duration;
}

/**
 * Periodically computes an inventory of all indexed packages into the storage
 * bucket, and produces metrics with an overview of the index' state.
 */
export class Inventory extends Construct {
  private readonly canary: Canary;
  private readonly rate: Duration;

  public constructor(scope: Construct, id: string, props: InventoryProps) {
    super(scope, id);

    this.rate = props.scheduleRate ?? Duration.minutes(15);

    this.canary = new Canary(this, 'Resource', {
      description: '[ConstructHub/Inventory] A canary that periodically inspects the list of indexed packages',
      environment: {
        AWS_EMF_ENVIRONMENT: 'Local',
        BUCKET_NAME: props.bucket.bucketName,
      },
      logRetention: props.logRetention,
      memorySize: 10_240,
      timeout: this.rate,
    });
    const grantRead = props.bucket.grantRead(this.canary);
    const grantWriteMissing = props.bucket.grantWrite(this.canary, MISSING_DOCUMENTATION_REPORT_PATTERN);
    const grantWriteCorruptAssembly = props.bucket.grantWrite(this.canary, CORRUPT_ASSEMBLY_REPORT_PATTERN);
    const grantWriteUnInstallable = props.bucket.grantWrite(this.canary, UNINSTALLABLE_PACKAGES_REPORT);

    const rule = new Rule(this, 'ScheduleRule', {
      schedule: Schedule.rate(this.rate),
      targets: [new LambdaFunction(this.canary)],
    });

    rule.node.addDependency(grantRead, grantWriteMissing);
    rule.node.addDependency(grantRead, grantWriteCorruptAssembly);
    rule.node.addDependency(grantRead, grantWriteUnInstallable);

    props.monitoring.addLowSeverityAlarm(
      'Inventory Canary is not Running',
      this.canary.metricInvocations({ period: this.rate }).createAlarm(this, 'Not Running', {
        alarmName: `${this.node.path}/NotRunning`,
        alarmDescription: [
          'The inventory canary is not running!',
          '',
          `RunBook: ${RUNBOOK_URL}`,
          '',
          `Direct link to function: ${lambdaFunctionUrl(this.canary)}`,
        ].join('\n'),
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
      }),
    );
    props.monitoring.addLowSeverityAlarm(
      'Inventory Canary is failing',
      this.canary.metricErrors({ period: this.rate }).createAlarm(this, 'Failures', {
        alarmName: `${this.node.path}/Failures`,
        alarmDescription: [
          'The inventory canary is failing!',
          '',
          `RunBook: ${RUNBOOK_URL}`,
          '',
          `Direct link to function: ${lambdaFunctionUrl(this.canary)}`,
        ].join('\n'),
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 2,
        threshold: 1,
      }),
    );
    props.overviewDashboard.addConcurrentExecutionMetricToDashboard(this.canary, 'CanaryResourceLambda');
    props.overviewDashboard.addInventoryMetrics(this);
  }

  public get function(): IFunction {
    return this.canary;
  }

  public metricMissingPackageMetadataCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.MISSING_METADATA_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricMissingAssemblyCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.MISSING_ASSEMBLY_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricPackageCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.PACKAGE_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricPackageMajorCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.PACKAGE_MAJOR_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricPackageVersionCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.PACKAGE_VERSION_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricMissingPackageTarballCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.MISSING_TARBALL_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricUninstallablePackageCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.UNINSTALLABLE_PACKAGE_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricSubmoduleCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.SUBMODULE_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricUnknownObjectCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.UNKNOWN_OBJECT_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of packages for which all versions are missing a documnetation artifact
   * (whether supported or not) for the provided `DocumentationLanguage`.
   */
  public metricMissingPackageCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_MISSING_PACKAGES,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of package major versions for which all versions are missing a
   * documnetation artifact (whether supported or not) for the provided
   * `DocumentationLanguage`.
   */
  public metricMissingMajorVersionCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_MISSING_MAJORS,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of package versions that are missing a documnetation artifact
   * (whether supported or not) for the provided `DocumentationLanguage`.
   */
  public metricMissingPackageVersionCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_MISSING_VERSIONS,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of package version submodules that are missing a documnetation
   * artifact (whether supported or not) for the provided
   * `DocumentationLanguage`.
   */
  public metricMissingSubmoduleCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_MISSING_SUBMODULES,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of packages that have at least one version for which there is
   * available documentation in the provided `DocumentationLanguage`.
   */
  public metricSupportedPackageCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_SUPPORTED_PACKAGES,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of package major versions that have at least one version for
   * which there is available documentation in the provided
   * `DocumentationLanguage`.
   */
  public metricSupportedMajorVersionCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_SUPPORTED_MAJORS,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of package versions that have available documentation in the
   * provided `DocumentationLanguage`.
   */
  public metricSupportedPackageVersionCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_SUPPORTED_VERSIONS,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of package version submodules that have available documentation
   * in the provided `DocumentationLanguage`.
   */
  public metricSupportedSubmoduleCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_SUPPORTED_SUBMODULES,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of packages that do not support the provided
   * `DocumentationLanguage`, and hence cannot have documentation for it.
   */
  public metricUnsupportedPackageCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_UNSUPPORTED_PACKAGES,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of package major versions that do not support the provided
   * `DocumentationLanguage`, and hence cannot have documentation for it.
   */
  public metricUnsupportedMajorVersionCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_UNSUPPORTED_MAJORS,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of package versions that do not support the provided
   * `DocumentationLanguage`, and hence cannot have documentation for it.
   */
  public metricUnsupportedPackageVersionCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_UNSUPPORTED_VERSIONS,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of package version submodules that do not support the provided
   * `DocumentationLanguage`, and hence cannot have documentation for it.
   */
  public metricUnsupportedSubmoduleCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_UNSUPPORTED_SUBMODULES,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of packages that have a language specific corrupt assembly.
   */
  public metricCorruptAssemblyPackageCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_CORRUPT_ASSEMBLY_PACKAGES,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of package major versions that have a language specific corrupt assembly.
   */
  public metricCorruptAssemblyMajorVersionCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_CORRUPT_ASSEMBLY_MAJORS,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of package versions that have a language specific corrupt assembly.
   */
  public metricCorruptAssemblyPackageVersionCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_CORRUPT_ASSEMBLY_VERSIONS,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The count of package version submodules that have a language specific corrupt assembly.
   */
  public metricCorruptAssemblySubmoduleCount(language: DocumentationLanguage, opts?: MetricOptions): Metric {
    return new Metric({
      period: this.rate,
      statistic: Statistic.MAXIMUM,
      ...opts,
      dimensions: {
        [LANGUAGE_DIMENSION]: language.toString(),
      },
      metricName: MetricName.PER_LANGUAGE_CORRUPT_ASSEMBLY_SUBMODULES,
      namespace: METRICS_NAMESPACE,
    });
  }

}
