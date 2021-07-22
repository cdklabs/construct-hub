import { basename, extname } from 'path';
import { URL } from 'url';
import { createGunzip } from 'zlib';

import { validateAssembly } from '@jsii/spec';
import { metricScope, Configuration, Unit } from 'aws-embedded-metrics';
import Environments from 'aws-embedded-metrics/lib/environment/Environments';
import type { Context, SQSEvent } from 'aws-lambda';
import { extract } from 'tar-stream';
import * as aws from '../shared/aws.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { IngestionInput } from '../shared/ingestion-input.lambda-shared';
import { integrity } from '../shared/integrity.lambda-shared';
import { MetricName, METRICS_NAMESPACE } from './constants';

Configuration.environmentOverride = Environments.Lambda;
Configuration.namespace = METRICS_NAMESPACE;

export const handler = metricScope((metrics) => async (event: SQSEvent, context: Context) => {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  // Clear out the default dimensions, we won't need them.
  metrics.setDimensions();

  const BUCKET_NAME = requireEnv('BUCKET_NAME');

  const result = new Array<CreatedObject>();

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

    const tar = await gunzip(Buffer.from(tarball.Body!));
    const { dotJsii, licenseText, packageJson } = await new Promise<{ dotJsii: Buffer; licenseText?: Buffer; packageJson: Buffer }>((ok, ko) => {
      let dotJsiiBuffer: Buffer | undefined;
      let licenseTextBuffer: Buffer | undefined;
      let packageJsonData: Buffer | undefined;
      const extractor = extract({ filenameEncoding: 'utf-8' })
        .once('error', (reason) => {
          ko(reason);
        })
        .once('finish', () => {
          if (dotJsiiBuffer == null) {
            ko(new Error('No .jsii file found in tarball!'));
          } else if (packageJsonData == null) {
            ko(new Error('No package.json file found in tarball!'));
          } else {
            ok({ dotJsii: dotJsiiBuffer, licenseText: licenseTextBuffer, packageJson: packageJsonData });
          }
        })
        .on('entry', (headers, stream, next) => {
          const chunks = new Array<Buffer>();
          if (headers.name === 'package/.jsii') {
            return stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
              .once('error', ko)
              .once('end', () => {
                dotJsiiBuffer = Buffer.concat(chunks);
                // Skip on next runLoop iteration so we avoid filling the stack.
                setImmediate(next);
              })
              .resume();
          } else if (headers.name === 'package/package.json') {
            return stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
              .once('error', ko)
              .once('end', () => {
                packageJsonData = Buffer.concat(chunks);
                // Skip on next runLoop iteration so we avoid filling the stack.
                setImmediate(next);
              })
              .resume();
          } else if (isLicenseFile(headers.name)) {
            return stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
              .once('error', ko)
              .once('end', () => {
                licenseTextBuffer = Buffer.concat(chunks);
                // Skip on next runLoop iteration so we avoid filling the stack.
                setImmediate(next);
              })
              .resume();
          }
          // Skip on next runLoop iteration so we avoid filling the stack.
          return setImmediate(next);
        });
      extractor.write(tar, (err) => {
        if (err != null) {
          ko(err);
        }
        extractor.end();
      });
    });
    const metadata = { date: payload.time, licenseText: licenseText?.toString('utf-8') };

    const { license: packageLicense, name: packageName, version: packageVersion } = validateAssembly(JSON.parse(dotJsii.toString('utf-8')));

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
        ContentType: 'application/x-gtar',
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

    const created = {
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
    result.push(created);
  }

  return result;
});

function gunzip(data: Buffer): Promise<Buffer> {
  const chunks = new Array<Buffer>();
  return new Promise<Buffer>((ok, ko) =>
    createGunzip()
      .once('error', ko)
      .on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      .once('end', () => ok(Buffer.concat(chunks)))
      .end(data));
}

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

interface CreatedObject {
  readonly bucket: string;
  readonly assembly: KeyAndVersion;
  readonly package: KeyAndVersion;
}

interface KeyAndVersion {
  readonly key: string;
  readonly versionId?: string;
}
