import { createHash } from 'crypto';
import { basename, extname } from 'path';
import { URL } from 'url';

import { validateAssembly } from '@jsii/spec';
import { metricScope, Configuration, Unit } from 'aws-embedded-metrics';
import Environments from 'aws-embedded-metrics/lib/environment/Environments';
import type { Context, SQSEvent } from 'aws-lambda';
import type { StateMachineInput } from '../payload-schema';
import * as aws from '../shared/aws.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { IngestionInput } from '../shared/ingestion-input.lambda-shared';
import { integrity } from '../shared/integrity.lambda-shared';
import { extractObjects } from '../shared/tarball.lambda-shared';
import { MetricName, METRICS_NAMESPACE } from './constants';

Configuration.environmentOverride = Environments.Lambda;
Configuration.namespace = METRICS_NAMESPACE;

export const handler = metricScope((metrics) => async (event: SQSEvent, context: Context) => {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  // Clear out the default dimensions, we won't need them.
  metrics.setDimensions();

  const BUCKET_NAME = requireEnv('BUCKET_NAME');
  const STATE_MACHINE_ARN = requireEnv('STATE_MACHINE_ARN');

  const result = new Array<string>();

  for (const record of event.Records ?? []) {
    const payload = JSON.parse(record.body) as IngestionInput;

    const tarballUri = new URL(payload.tarballUri);
    if (tarballUri.protocol !== 's3:') {
      throw new Error(`Unsupported protocol in URI: ${tarballUri}`);
    }
    const tarball = await aws.s3().getObject({
      // Note: we drop anything after the first `.` in the host, as we only care about the bucket name.
      Bucket: tarballUri.host.split('.')[0],
      // Note: the pathname part is absolute, so we strip the leading `/`.
      Key: tarballUri.pathname.replace(/^\//, ''),
      VersionId: tarballUri.searchParams.get('versionId') ?? undefined,
    }).promise();

    const integrityCheck = integrity(payload, Buffer.from(tarball.Body!));
    if (payload.integrity !== integrityCheck) {
      throw new Error(`Integrity check failed: ${payload.integrity} !== ${integrityCheck}`);
    }

    let dotJsii: Buffer;
    let packageJson: Buffer;
    let licenseText: Buffer | undefined;
    try {
      ({ dotJsii, packageJson, licenseText } = await extractObjects(
        Buffer.from(tarball.Body!),
        {
          dotJsii: { path: 'package/.jsii', required: true },
          packageJson: { path: 'package/package.json', required: true },
          licenseText: { filter: isLicenseFile },
        },
      ));
    } catch (err) {
      console.error(`Invalid tarball content: ${err}`);
      metrics.putMetric(MetricName.INVALID_TARBALL, 1, Unit.Count);
      return;
    }
    const metadata = { date: payload.time, licenseText: licenseText?.toString('utf-8') };

    let packageLicense: string;
    let packageName: string;
    let packageVersion: string;
    try {
      const { license, name, version } = validateAssembly(JSON.parse(dotJsii.toString('utf-8')));
      packageLicense = license;
      packageName = name;
      packageVersion = version;
      metrics.putMetric(MetricName.INVALID_ASSEMBLY, 0, Unit.Count);
    } catch (ex) {
      console.error(`Package does not contain a valid assembly -- ignoring: ${ex}`);
      metrics.putMetric(MetricName.INVALID_ASSEMBLY, 1, Unit.Count);
      return;
    }

    // Ensure the `.jsii` name, version & license corresponds to those in `package.json`
    const { name: packageJsonName, version: packageJsonVersion, license: packageJsonLicense } = JSON.parse(packageJson.toString('utf-8'));
    if (packageJsonName !== packageName || packageJsonVersion !== packageVersion || packageJsonLicense !== packageLicense) {
      console.log(`Ignoring package with mismatched name, version, and/or license (${packageJsonName}@${packageJsonVersion} is ${packageJsonLicense} !== ${packageName}@${packageVersion} is ${packageLicense})`);
      metrics.putMetric(MetricName.MISMATCHED_IDENTITY_REJECTIONS, 1, Unit.Count);
      continue;
    }
    metrics.putMetric(MetricName.MISMATCHED_IDENTITY_REJECTIONS, 0, Unit.Count);

    // Did we identify a license file or not?
    metrics.putMetric(MetricName.FOUND_LICENSE_FILE, licenseText != null ? 1 : 0, Unit.Count);

    const { assemblyKey, metadataKey, packageKey } = constants.getObjectKeys(packageName, packageVersion);
    console.log(`Writing assembly at ${assemblyKey}`);
    console.log(`Writing package at  ${packageKey}`);
    console.log(`Writing metadata at  ${metadataKey}`);

    // we upload the metadata file first because the catalog builder depends on
    // it and is triggered by the assembly file upload.
    console.log(`${packageName}@${packageVersion} | Uploading package and metadata files`);
    const [pkg, storedMetadata] = await Promise.all([
      aws.s3().putObject({
        Bucket: BUCKET_NAME,
        Key: packageKey,
        Body: tarball.Body,
        CacheControl: 'public',
        ContentType: 'application/octet-stream',
        Metadata: {
          'Lambda-Log-Group': context.logGroupName,
          'Lambda-Log-Stream': context.logStreamName,
          'Lambda-Run-Id': context.awsRequestId,
        },
      }).promise(),
      aws.s3().putObject({
        Bucket: BUCKET_NAME,
        Key: metadataKey,
        Body: JSON.stringify(metadata),
        CacheControl: 'public',
        ContentType: 'application/json',
        Metadata: {
          'Lambda-Log-Group': context.logGroupName,
          'Lambda-Log-Stream': context.logStreamName,
          'Lambda-Run-Id': context.awsRequestId,
        },
      }).promise(),
    ]);

    // now we can upload the assembly.
    console.log(`${packageName}@${packageVersion} | Uploading assembly file`);
    const assembly = await aws.s3().putObject({
      Bucket: BUCKET_NAME,
      Key: assemblyKey,
      Body: dotJsii,
      CacheControl: 'public',
      ContentType: 'application/json',
      Metadata: {
        'Lambda-Log-Group': context.logGroupName,
        'Lambda-Log-Stream': context.logStreamName,
        'Lambda-Run-Id': context.awsRequestId,
      },
    }).promise();

    const created: StateMachineInput = {
      bucket: BUCKET_NAME,
      assembly: {
        key: assemblyKey,
        versionId: assembly.VersionId,
      },
      package: {
        key: packageKey,
        versionId: pkg.VersionId,
      },
      metadata: {
        key: metadataKey,
        versionId: storedMetadata.VersionId,
      },
    };
    console.log(`Created objects: ${JSON.stringify(created, null, 2)}`);

    const sfn = await aws.stepFunctions().startExecution({
      input: JSON.stringify(created),
      name: sfnExecutionNameFromParts(packageName, `v${packageVersion}`, context.awsRequestId),
      stateMachineArn: STATE_MACHINE_ARN,
    }).promise();
    console.log(`Started StateMachine execution: ${sfn.executionArn}`);
    result.push(sfn.executionArn);
  }

  return result;
});

/**
 * Checks whether the provided file name corresponds to a license file or not.
 *
 * @param fileName the file name to be checked.
 *
 * @returns `true` IIF the file is named LICENSE and has the .MD or .TXT
 *          extension, or no extension at all. The test is case-insensitive.
 */
function isLicenseFile(fileName: string): boolean {
  const ext = extname(fileName);
  const possibleExtensions = new Set(['', '.md', '.txt']);
  return possibleExtensions.has(ext.toLowerCase())
    && basename(fileName, ext).toUpperCase() === 'LICENSE';
}


/**
 * Creates a StepFunction execution request name based on the provided parts.
 * The result is guaranteed to be 80 characters or less and to contain only
 * characters that are valid for a StepFunction execution request name for which
 * CloudWatch Logging can be enabled. The resulting name is very likely to
 * be unique for a given input.
 */
function sfnExecutionNameFromParts(first: string, ...rest: readonly string[]): string {
  const parts = [first, ...rest];
  const name = parts
    .map((part) => part.replace(/[^a-z0-9_-]+/ig, '_'))
    .join('_')
    .replace(/^_/g, '')
    .replace(/_{2,}/g, '_');
  if (name.length <= 80) {
    return name;
  }
  const suffix = createHash('sha256')
  // The hash is computed based on input arguments, to maximize unicity
    .update(parts.join('_'))
    .digest('hex')
    .substring(0, 6);
  return `${name.substring(0, 80 - suffix.length - 1)}_${suffix}`;
}
