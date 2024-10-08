import {
  CodeartifactClient,
  GetPackageVersionAssetCommand,
  PackageFormat,
} from '@aws-sdk/client-codeartifact';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { SPEC_FILE_NAME } from '@jsii/spec';
import { metricScope, Unit } from 'aws-embedded-metrics';
import type { Context, EventBridgeEvent } from 'aws-lambda';
import { captureAWSv3Client } from 'aws-xray-sdk-core';
import {
  METRICS_NAMESPACE,
  MetricName,
  DOMAIN_OWNER_DIMENSION,
  DOMAIN_NAME_DIMENSION,
  REPOSITORY_NAME_DIMENSION,
} from './constants.lambda-shared';
import { DenyListClient } from '../../backend/deny-list/client.lambda-shared';
import { LicenseListClient } from '../../backend/license-list/client.lambda-shared';
import { S3_CLIENT, SQS_CLIENT } from '../../backend/shared/aws.lambda-shared';
import { requireEnv } from '../../backend/shared/env.lambda-shared';
import { integrity } from '../../backend/shared/integrity.lambda-shared';
import { extractObjects } from '../../backend/shared/tarball.lambda-shared';

const DETAIL_TYPE = 'CodeArtifact Package Version State Change' as const;

const CODEARTIFACT_CLIENT: CodeartifactClient = captureAWSv3Client(
  new CodeartifactClient()
);

export const handler = metricScope(
  (metrics) =>
    async (
      event: EventBridgeEvent<typeof DETAIL_TYPE, CodeArtifactDetail>,
      context: Context
    ) => {
      console.log(`Event: ${JSON.stringify(event, null, 2)}`);

      const stagingBucket = requireEnv('BUCKET_NAME');
      const queueUrl = requireEnv('QUEUE_URL');

      metrics.setNamespace(METRICS_NAMESPACE);
      metrics.setDimensions({
        [DOMAIN_OWNER_DIMENSION]: event.detail.domainOwner,
        [DOMAIN_NAME_DIMENSION]: event.detail.domainName,
        [REPOSITORY_NAME_DIMENSION]: event.detail.repositoryName,
      });

      const packageName = event.detail.packageNamespace
        ? `@${event.detail.packageNamespace}/${event.detail.packageName}`
        : event.detail.packageName;

      if (event.detail.operationType === 'Deleted') {
        console.log(
          `Operation type is "Deleted" for ${packageName}@${event.detail.packageVersion}`
        );
        metrics.putMetric(MetricName.DELETED_COUNT, 1, Unit.Count);
        return;
      }

      const denyList = await DenyListClient.newClient();
      const denied = denyList.lookup(packageName, event.detail.packageVersion);
      if (denied) {
        console.log(
          `Package ${packageName}@${
            event.detail.packageVersion
          } denied: ${JSON.stringify(denied, null, 2)}`
        );
        metrics.putMetric(MetricName.DENY_LISTED_COUNT, 1, Unit.Count);
        return;
      }

      const { asset, packageVersionRevision } = await CODEARTIFACT_CLIENT.send(
        new GetPackageVersionAssetCommand({
          asset: 'package.tgz', // Always named this way for npm packages!
          domainOwner: event.detail.domainOwner,
          domain: event.detail.domainName,
          repository: event.detail.repositoryName,
          format: event.detail.packageFormat as PackageFormat, // input is provided by EventBridge and should be correct, if not a hard fail seems fine
          namespace: event.detail.packageNamespace,
          package: event.detail.packageName,
          packageVersion: event.detail.packageVersion,
        })
      );
      const tarball = Buffer.from(await asset!.transformToByteArray());

      const { assemblyJson, packageJson } = await extractObjects(tarball, {
        assemblyJson: { path: `package/${SPEC_FILE_NAME}` },
        packageJson: { path: 'package/package.json', required: true },
      });
      metrics.putMetric(
        MetricName.NOT_JSII_ENABLED_COUNT,
        assemblyJson ? 0 : 1,
        Unit.Count
      );
      if (assemblyJson == null) {
        console.log(
          `Package "${packageName}@${event.detail.packageVersion}" does not contain a ${SPEC_FILE_NAME} assembly`
        );
        return;
      }

      const metadata = JSON.parse(packageJson.toString('utf-8'));
      const licenseList = await LicenseListClient.newClient();
      const eligibleLicense = licenseList.lookup(
        metadata.license ?? 'UNLICENSED'
      );
      metrics.putMetric(
        MetricName.INELIGIBLE_LICENSE,
        eligibleLicense ? 0 : 1,
        Unit.Count
      );
      if (!eligibleLicense) {
        console.log(
          `Package "${packageName}@${
            event.detail.packageVersion
          }" does not use allow-listed license: ${
            metadata.license ?? 'UNLICENSED'
          }`
        );
        return;
      }

      const stagingKey = `${packageName}/${event.detail.packageVersion}/${packageVersionRevision}/package.tgz`;
      await S3_CLIENT.send(
        new PutObjectCommand({
          Bucket: stagingBucket,
          Key: stagingKey,
          Body: asset,
          ContentType: 'application/octet-stream',
          Metadata: {
            'Lambda-Log-Group': context.logGroupName,
            'Lambda-Log-Stream': context.logStreamName,
            'Lambda-Run-Id': context.awsRequestId,
          },
        })
      );

      const message = integrity(
        {
          tarballUri: `s3://${stagingBucket}/${stagingKey}`,
          metadata: { resources: event.resources.join(', ') },
          time: event.time,
        },
        tarball
      );
      return SQS_CLIENT.send(
        new SendMessageCommand({
          MessageAttributes: {
            AWS_REQUEST_ID: {
              DataType: 'String',
              StringValue: context.awsRequestId,
            },
            LOG_GROUP_NAME: {
              DataType: 'String',
              StringValue: context.logGroupName,
            },
            LOG_STREAM_NAME: {
              DataType: 'String',
              StringValue: context.logStreamName,
            },
          },
          MessageBody: JSON.stringify(message),
          QueueUrl: queueUrl,
        })
      );
    }
);

/**
 * @see https://docs.aws.amazon.com/codeartifact/latest/ug/service-event-format-example.html
 */
interface CodeArtifactDetail {
  /**
   * The domain that contains the repository that contains the package.
   */
  readonly domainName: string;

  /**
   * The AWS account ID of the owner of the domain.
   */
  readonly domainOwner: string;

  /**
   * The repository that contains the package.
   */
  readonly repositoryName: string;

  /**
   * The format of the package that triggered the event.
   */
  readonly packageFormat: string;

  /**
   * The namespace of the package that triggered the event.
   */
  readonly packageNamespace?: string;

  /**
   * The name of the package that triggered the event.
   */
  readonly packageName: string;

  /**
   * The version of the package that triggered the event.
   */
  readonly packageVersion: string;

  /**
   * The state of the package version when the event was triggered.
   */
  readonly packageVersionState:
    | 'Unfinished'
    | 'Published'
    | 'Unlisted'
    | 'Archived'
    | 'Disposed';

  /**
   * A value that uniquely identifies the state of the assets and metadata of the package version when the event was
   * triggered. If the package version is modified (for example, by adding another JAR file to a Maven package), the
   * packageVersionRevision changes.
   */
  readonly packageVersionRevision: string;

  readonly changes: {
    /**
     * The number of assets added to a package that triggered an event. Examples of an asset are a Maven JAR file or a
     * Python wheel.
     */
    readonly assetsAdded: number;

    /**
     * The number of assets removed from a package that triggered an event.
     */
    readonly assetsRemoved: number;

    /**
     * The number of assets modified in the package that triggered the event.
     */
    readonly metadataUpdated: boolean;

    /**
     * A boolean value that is set to true if the event includes modified package-level metadata. For example, an event
     * might modify a Maven pom.xml file.
     */
    readonly assetsUpdated: number;

    /**
     * A boolean value that is set to true if the event's packageVersionStatus is modified(for example, if
     * packageVersionStatus changes from Unfinished to Published).
     */
    readonly statusChanged: boolean;
  };

  /**
   * Describes the high-level type of the package version change.
   */
  readonly operationType: 'Created' | 'Updated' | 'Deleted';

  /**
   * An integer that specifies an event number for a package. Each event on a package increments the sequenceNumber so
   * events can be arranged sequentially. An event can increment the sequenceNumber by any integer number.
   */
  readonly sequenceNumber: number;

  /**
   * An ID used to differentiate duplicate EventBridge events. In rare cases, EventBridge might trigger the same rule
   * more than once for a single event or scheduled time. Or, it might invoke the same target more than once for a given
   * triggered rule.
   */
  readonly eventDeduplicationId: string;
}
