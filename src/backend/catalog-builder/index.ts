import type { AssemblyTargets } from '@jsii/spec';
import { ArnFormat, Duration, Stack } from 'aws-cdk-lib';
import {
  ComparisonOperator,
  MathExpression,
  Metric,
  MetricOptions,
  Statistic,
} from 'aws-cdk-lib/aws-cloudwatch';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { IFunction, Tracing } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { lambdaFunctionUrl, s3ObjectUrl } from '../../deep-link';

import { Monitoring } from '../../monitoring';
import { OverviewDashboard } from '../../overview-dashboard';
import { RUNBOOK_URL } from '../../runbook-url';
import { DenyList } from '../deny-list';
import { FeedBuilder } from '../feed-builder';
import type { ConstructFramework } from '../ingestion/framework-detection.lambda-shared';
import { CatalogBuilder as Handler } from './catalog-builder';
import { MetricName, METRICS_NAMESPACE } from './constants';

/**
 * Props for `CatalogBuilder`.
 */
export interface CatalogBuilderProps {
  /**
   * The package store bucket.
   */
  readonly bucket: IBucket;

  /**
   * The monitoring handler to register alarms with.
   */
  readonly monitoring: Monitoring;

  /**
   * The overview dashboard to add widgets to.
   */
  readonly overviewDashboard: OverviewDashboard;

  /**
   * How long should execution logs be retained?
   *
   * @default RetentionDays.TEN_YEARS
   */
  readonly logRetention?: RetentionDays;

  /**
   * The deny list construct.
   */
  readonly denyList: DenyList;

  /**
   * Construct that generates RSS/ATOM feed after catalog is updated
   */
  readonly feedBuilder: FeedBuilder;
}

/**
 * Builds or re-builds the `catalog.json` object in the designated bucket.
 */
export class CatalogBuilder extends Construct {
  public readonly function: IFunction;

  public constructor(scope: Construct, id: string, props: CatalogBuilderProps) {
    super(scope, id);

    const handler = new Handler(this, 'Default', {
      description: `Creates the catalog.json object in ${props.bucket.bucketName}`,
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        AWS_EMF_ENVIRONMENT: 'Local',
        FEED_BUILDER_FUNCTION_NAME:
          props.feedBuilder.updateFeedFunction.functionName,
      },
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 10_240, // Currently the maximum possible setting
      reservedConcurrentExecutions: 1,
      timeout: Duration.minutes(15),
      tracing: Tracing.PASS_THROUGH,
    });
    this.function = handler;
    props.overviewDashboard.addConcurrentExecutionMetricToDashboard(
      handler,
      'CatalogBuilderLambda'
    );

    // This function may invoke itself in case it needs to continue it's work in
    // a "child" invocation. We must hence allow it to invoke itself. We cannot
    // use grantInvoke as this would (naturally) cause a circular reference
    // (Function -> Role -> Function).
    handler.addToRolePolicy(
      new PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        effect: Effect.ALLOW,
        resources: [
          Stack.of(this).formatArn({
            arnFormat: ArnFormat.COLON_RESOURCE_NAME,
            service: 'lambda',
            resource: 'function',
            resourceName: '*',
          }),
        ],
      })
    );

    // using handler.grantInvoke(props.feedBuilder.updateFeedFunction)
    // causes circular dependency error
    handler.addToRolePolicy(
      new PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        effect: Effect.ALLOW,
        resources: [props.feedBuilder.updateFeedFunction.functionArn],
      })
    );

    // allow the catalog builder to use the client.
    props.denyList.grantRead(handler);

    props.bucket.grantReadWrite(this.function);

    // Monitor the derivative of the catalog size, and alarm if the catalog
    // loses more than 5 items. Catalog elements can disappear if they are added
    // to the deny-list, or if they get un-published from the origin repository.
    // Such cases are normal and shouldn't typically result in a significant
    // contraction of the catalog size.
    const catalogSizeChange = new MathExpression({
      expression: 'DIFF(FILL(m1, REPEAT))',
      period: Duration.minutes(15),
      usingMetrics: { m1: this.metricRegisteredPackageMajorVersions() },
    });
    const alarmShrinkingCatalog = catalogSizeChange.createAlarm(
      this,
      'ShrinkingCatalogAlarm',
      {
        alarmName: `${this.node.path}/ShrinkingCatalog`,
        alarmDescription: [
          'The number of packages registered in the catalog.json object has shrunk by more than 5',
          'elements. There might be a mass extinction event going on. This should be investigated',
          'as soon as possible.',
          '',
          `Catalog.json: ${s3ObjectUrl(props.bucket, 'catalog.json')}`,
          `Catalog Builder: ${lambdaFunctionUrl(handler)}`,
          '',
          `RUNBOOK: ${RUNBOOK_URL}`,
        ].join('\n'),
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 1,
        threshold: -5,
      }
    );
    // This is a high-severity alarm because it is indicative of a possible mass-extinction event
    // in the catalog. This should definitely prompt immediate investigation, although it can also
    // be caused by the recent addition of enough packages in the deny-list to cause the alarm to
    // trigger.
    props.monitoring.addHighSeverityAlarm(
      'Catalog Size Shrunk',
      alarmShrinkingCatalog
    );
  }

  public metricMissingConstructFrameworkCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(15),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.MISSING_CONSTRUCT_FRAMEWORK_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricMissingConstructFrameworkVersionCount(
    opts?: MetricOptions
  ): Metric {
    return new Metric({
      period: Duration.minutes(15),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.MISSING_CONSTRUCT_FRAMEWORK_VERSION_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricRegisteredPackageMajorVersions(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(15),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.REGISTERED_PACKAGES_MAJOR_VERSION,
      namespace: METRICS_NAMESPACE,
    });
  }

  public metricRegisteredPackages(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(15),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.REGISTERED_PACKAGES,
      namespace: METRICS_NAMESPACE,
    });
  }
}

/**
 * Data format for catalog object.
 */
export interface CatalogModel {
  /**
   * Packages in the catalog.
   */
  readonly packages: PackageInfo[];
  /**
   * Date the catalog was last updated, in ISO 8601 format.
   */
  readonly updated: string;
}

/**
 * Data format for packages stored in the catalog.
 */
export interface PackageInfo {
  /**
   * The name of the assembly.
   */
  readonly name: string;

  /**
   * The major version of this assembly, according to SemVer.
   */
  readonly major: number;

  /**
   * The complete SemVer version string for this package's major version stream,
   * including pre-release identifiers, but excluding additional metadata
   * (everything starting at `+`, if there is any).
   */
  readonly version: string;

  /**
   * The SPDX license identifier for the package's license.
   */
  readonly license: string;

  /**
   * The list of keywords configured on the package.
   */
  readonly keywords: readonly string[];

  /**
   * Metadata assigned by the discovery function to the latest release of this
   * package's major version stream, if any.
   */
  readonly metadata?: { readonly [key: string]: string };

  /**
   * The construct framework, if present.
   */
  readonly constructFramework?: ConstructFramework | undefined;

  /**
   * The author of the package.
   */
  readonly author: {
    readonly name: string;
    readonly email?: string;
    readonly url?: string;
  };

  /**
   * The list of languages configured on the package, and the corresponding
   * configuration.
   */
  readonly languages: AssemblyTargets;

  /**
   * The timestamp at which this version was created.
   */
  readonly time: Date;

  /**
   * The description of the package.
   */
  readonly description?: string;
}
