import { ArnFormat, Aws, Duration, Stack } from 'aws-cdk-lib';
import {
  ComparisonOperator,
  GraphWidget,
  MathExpression,
  Metric,
  MetricOptions,
  Statistic,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { CfnRepository } from 'aws-cdk-lib/aws-codeartifact';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Tracing } from 'aws-cdk-lib/aws-lambda';
import { BlockPublicAccess, IBucket } from 'aws-cdk-lib/aws-s3';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import {
  codeArtifactRepositoryUrl,
  lambdaFunctionUrl,
  lambdaSearchLogGroupUrl,
  sqsQueueUrl,
} from '../deep-link';
import { fillMetric } from '../metric-utils';
import type {
  IPackageSource,
  PackageSourceBindOptions,
  PackageSourceBindResult,
} from '../package-source';
import { CodeArtifactForwarder } from './codeartifact/code-artifact-forwarder';
import {
  METRICS_NAMESPACE,
  MetricName,
  DOMAIN_NAME_DIMENSION,
  DOMAIN_OWNER_DIMENSION,
  REPOSITORY_NAME_DIMENSION,
} from './codeartifact/constants.lambda-shared';
import { S3StorageFactory } from '../s3/storage';

export interface CodeArtifactProps {
  /**
   * The CodeArtifact repository where packages are obtained from.
   */
  readonly repository: CfnRepository;

  /**
   * The S3 bucket where packages will be staged.
   */
  readonly bucket?: IBucket;
}

/**
 * A package source that obtains package data from an npm CodeArtifact
 * repository.
 */
export class CodeArtifact implements IPackageSource {
  public constructor(private readonly props: CodeArtifactProps) {}

  public bind(
    scope: Construct,
    {
      denyList,
      ingestion,
      licenseList,
      monitoring,
      overviewDashboard,
      queue,
    }: PackageSourceBindOptions
  ): PackageSourceBindResult {
    const idPrefix = this.props.repository.node.path;
    const repositoryId = `${this.props.repository.attrDomainOwner}:${this.props.repository.attrDomainName}/${this.props.repository.attrName}`;

    const storageFactory = S3StorageFactory.getOrCreate(scope);
    const bucket =
      this.props.bucket ||
      storageFactory.newBucket(scope, `${idPrefix}/StagingBucket`, {
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        lifecycleRules: [{ expiration: Duration.days(30) }],
      });
    bucket.grantRead(ingestion);

    const dlq = new Queue(scope, `${idPrefix}/DLQ`, {
      encryption: QueueEncryption.KMS_MANAGED,
      retentionPeriod: Duration.days(14),
      visibilityTimeout: Duration.minutes(15),
    });

    const forwarder = new CodeArtifactForwarder(
      scope,
      `${idPrefix}/Forwarder`,
      {
        deadLetterQueue: dlq,
        description: `[${scope.node.path}/CodeArtifact/${repositoryId}] Handle CodeArtifact EventBridge events`,
        environment: {
          AWS_EMF_ENVIRONMENT: 'Local',
          BUCKET_NAME: bucket.bucketName,
          QUEUE_URL: queue.queueUrl,
        },
        memorySize: 1024,
        timeout: Duration.seconds(60),
        tracing: Tracing.ACTIVE,
      }
    );
    bucket.grantReadWrite(forwarder);
    denyList?.grantRead(forwarder);
    licenseList.grantRead(forwarder);
    queue.grantSendMessages(forwarder);
    forwarder.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['codeartifact:GetPackageVersionAsset'],
        resources: [
          Stack.of(scope).formatArn({
            service: 'codeartifact',
            resource: 'package',
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
            resourceName: [
              this.props.repository.attrDomainName,
              this.props.repository.attrName,
              'npm', // package format
              '*', // namespace/package-name
            ].join('/'),
          }),
        ],
      })
    );

    const rule = new Rule(scope, `${idPrefix}/EventBridge`, {
      description: `${scope.node.path}/CodeArtifact/${repositoryId}/EventBridge`,
      eventPattern: {
        source: ['aws.codeartifact'],
        detailType: ['CodeArtifact Package Version State Change'],
        detail: {
          domainOwner: [this.props.repository.attrDomainOwner],
          domainName: [this.props.repository.attrDomainName],
          repositoryName: [this.props.repository.attrName],
          packageFormat: ['npm'],
        },
      },
      targets: [new LambdaFunction(forwarder)],
    });

    const failureAlarm = forwarder
      .metricErrors()
      .createAlarm(scope, `${idPrefix}/Forwarder/Failures`, {
        alarmName: `${scope.node.path}/CodeArtifact/${repositoryId}/Forwarder`,
        alarmDescription: [
          `The CodeArtifact fowarder for ${repositoryId} is failing`,
          '',
          `Link to the lambda function: ${lambdaFunctionUrl(forwarder)}`,
        ].join('\n'),
        comparisonOperator:
          ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 3,
        threshold: 1,
        treatMissingData: TreatMissingData.MISSING,
      });
    monitoring.addHighSeverityAlarm(
      `CodeArtifact:${this.props.repository.attrName} Failures`,
      failureAlarm
    );

    const dlqNotEmptyAlarm = new MathExpression({
      expression: 'mVisible + mHidden',
      usingMetrics: {
        mVisible: dlq.metricApproximateNumberOfMessagesVisible({
          period: Duration.minutes(1),
        }),
        mHidden: dlq.metricApproximateNumberOfMessagesNotVisible({
          period: Duration.minutes(1),
        }),
      },
    }).createAlarm(scope, `${idPrefix}/Forwarder/DLQNotEmpty`, {
      alarmName: `${scope.node.path}/CodeArtifact/${repositoryId}/DLQNotEmpty`,
      alarmDescription: [
        `The CodeArtifact fowarder for ${repositoryId} is failing`,
        '',
        `Link to the lambda function: ${lambdaFunctionUrl(forwarder)}`,
        `Link to the dead letter queue: ${sqsQueueUrl(dlq)}`,
      ].join('/n'),
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      threshold: 1,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    monitoring.addLowSeverityAlarm(
      `CodeArtifact/${repositoryId} DLQ Not Empty`,
      dlqNotEmptyAlarm
    );

    rule.node.addDependency(failureAlarm, dlqNotEmptyAlarm);

    overviewDashboard.addDLQMetricToDashboard(
      `CodeArtifact/${repositoryId} DLQ`,
      dlq
    );
    overviewDashboard.addConcurrentExecutionMetricToDashboard(
      forwarder,
      `${idPrefix}/ForwarderLambda`
    );

    return {
      name: `CodeArtifact: ${repositoryId}`,
      links: [
        {
          name: 'CodeArtifact',
          url: codeArtifactRepositoryUrl(this.props.repository),
          primary: true,
        },
        {
          name: 'Forwarder Function',
          url: lambdaFunctionUrl(forwarder),
        },
        {
          name: 'Search Log group',
          url: lambdaSearchLogGroupUrl(forwarder),
        },
        {
          name: 'DLQ',
          url: sqsQueueUrl(dlq),
        },
      ],
      dashboardWidgets: [
        [
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Function Health',
            left: [
              fillMetric(forwarder.metricInvocations({ label: 'Invocations' })),
              fillMetric(forwarder.metricErrors({ label: 'Errors' })),
            ],
            leftYAxis: { min: 0 },
            right: [forwarder.metricDuration({ label: 'Duration' })],
            rightYAxis: { min: 0 },
            period: Duration.minutes(15),
          }),
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Dead Letter Queue',
            left: [
              dlq.metricApproximateNumberOfMessagesVisible({
                label: 'Visible Messages',
                period: Duration.minutes(1),
              }),
              dlq.metricApproximateNumberOfMessagesNotVisible({
                label: 'Hidden Messages',
                period: Duration.minutes(1),
              }),
            ],
            leftYAxis: { min: 0 },
            right: [
              dlq.metricApproximateAgeOfOldestMessage({
                label: 'Oldest Message Age',
                period: Duration.minutes(1),
              }),
            ],
            rightYAxis: { min: 0 },
          }),
        ],
        [
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Quality Metrics',
            left: [
              fillMetric(
                this.metricNotJsiiEnabledCount({ label: 'Not a jsii package' }),
                0
              ),
              fillMetric(
                this.metricIneligibleLicense({ label: 'Ineligible License' }),
                0
              ),
              fillMetric(
                this.metricDenyListedCount({ label: 'Deny Listed' }),
                0
              ),
              fillMetric(
                this.metricDeletedCount({ label: 'Deletion Events' }),
                0
              ),
            ],
            leftYAxis: { min: 0 },
          }),
        ],
      ],
    };
  }

  /**
   * The count of package versions that were ignored due to being in the deny list.
   */
  public metricDenyListedCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      dimensionsMap: {
        [DOMAIN_OWNER_DIMENSION]: this.props.repository.attrDomainOwner,
        [DOMAIN_NAME_DIMENSION]: this.props.repository.attrDomainName,
        [REPOSITORY_NAME_DIMENSION]: this.props.repository.attrName,
      },
      metricName: MetricName.DENY_LISTED_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The number of package versions that were ignored due to using an ineloigible license.
   */
  public metricIneligibleLicense(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      dimensionsMap: {
        [DOMAIN_OWNER_DIMENSION]:
          this.props.repository.attrDomainOwner ?? Aws.ACCOUNT_ID,
        [DOMAIN_NAME_DIMENSION]: this.props.repository.attrDomainName,
        [REPOSITORY_NAME_DIMENSION]: this.props.repository.attrName,
      },
      metricName: MetricName.INELIGIBLE_LICENSE,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The number of package versions that were deleted from CodeArtifact (those events are not
   * handled currently).
   */
  public metricDeletedCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      dimensionsMap: {
        [DOMAIN_OWNER_DIMENSION]:
          this.props.repository.attrDomainOwner ?? Aws.ACCOUNT_ID,
        [DOMAIN_NAME_DIMENSION]: this.props.repository.attrDomainName,
        [REPOSITORY_NAME_DIMENSION]: this.props.repository.attrName,
      },
      metricName: MetricName.DELETED_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }

  /**
   * The number of package versions that do not have a jsii assembly in the package.
   */
  public metricNotJsiiEnabledCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      dimensionsMap: {
        [DOMAIN_OWNER_DIMENSION]:
          this.props.repository.attrDomainOwner ?? Aws.ACCOUNT_ID,
        [DOMAIN_NAME_DIMENSION]: this.props.repository.attrDomainName,
        [REPOSITORY_NAME_DIMENSION]: this.props.repository.attrName,
      },
      metricName: MetricName.NOT_JSII_ENABLED_COUNT,
      namespace: METRICS_NAMESPACE,
    });
  }
}
