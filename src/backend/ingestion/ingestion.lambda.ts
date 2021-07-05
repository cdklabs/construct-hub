import { URL } from 'url';
import { createGunzip } from 'zlib';

import { validateAssembly } from '@jsii/spec';
// eslint-disable-next-line import/no-unresolved
import { Context, SQSEvent } from 'aws-lambda';
import { extract } from 'tar-stream';
import * as aws from '../shared/aws.lambda-shared';
import * as constants from '../shared/constants.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';
import { IngestionInput } from '../shared/ingestion-input.lambda-shared';
import { integrity } from '../shared/integrity.lambda-shared';

export async function handler(event: SQSEvent, context: Context) {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

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
    const { dotJsii, licenseText } = await new Promise<{ dotJsii: Buffer; licenseText?: Buffer }>((ok, ko) => {
      let dotJsiiBuffer: Buffer | undefined;
      let licenseTextBuffer: Buffer | undefined;
      extract()
        .on('entry', (headers, stream, next) => {
          const chunks = new Array<Buffer>();
          switch (headers.name) {
            case 'package/.jsii':
              return stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
                .once('error', ko)
                .once('end', () => {
                  dotJsiiBuffer = Buffer.concat(chunks);
                  // Skip on next runLoop iteration so we avoid filling the stack.
                  setImmediate(next);
                })
                .resume();
            case 'package/LICENSE':
            case 'package/LICENSE.md':
            case 'package/LICENSE.txt':
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
        })
        .once('error', ko)
        .once('close', () => {
          if (dotJsiiBuffer == null) {
            ko(new Error('No .jsii file found in tarball!'));
          } else {
            ok({ dotJsii: dotJsiiBuffer, licenseText: licenseTextBuffer });
          }
        })
        .write(tar, (err) => {
          if (err != null) {
            ko(err);
          }
        });
    });
    const metadata = { date: payload.time, licenseText: licenseText?.toString('utf-8') };

    const { license, name: packageName, version: packageVersion } = validateAssembly(JSON.parse(dotJsii.toString('utf-8')));
    // Re-check that the license in `.jsii` is eligible. We don't blindly expect it matches that in package.json!
    if (!constants.ELIGIBLE_LICENSES.has(license.toUpperCase())) {
      console.log(`Ignoring package with ineligible license (SPDX identifier "${license}")`);
      continue;
    }

    const assemblyKey = `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.ASSEMBLY_KEY_SUFFIX}`;
    console.log(`Writing assembly at ${assemblyKey}`);
    const packageKey = `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.PACKAGE_KEY_SUFFIX}`;
    console.log(`Writing package at  ${packageKey}`);
    const metadataKey = `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.METADATA_KEY_SUFFIX}`;
    console.log(`Writing metadata at  ${metadataKey}`);

    // we upload the metadata file first because the catalog builder depends on
    // it and is triggered by the assembly file upload.
    console.log(`${packageName}@${packageVersion} | Uploading package and metadata files`);
    const [pkg, storedMetadata] = await Promise.all([
      aws.s3().putObject({
        Bucket: BUCKET_NAME,
        Key: packageKey,
        Body: tarball.Body,
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
}

function gunzip(data: Buffer): Promise<Buffer> {
  const chunks = new Array<Buffer>();
  return new Promise<Buffer>((ok, ko) =>
    createGunzip()
      .once('error', ko)
      .on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      .once('end', () => ok(Buffer.concat(chunks)))
      .end(data));
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
