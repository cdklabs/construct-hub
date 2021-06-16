import { URL } from 'url';
import { createGunzip } from 'zlib';

import { validateAssembly } from '@jsii/spec';
// eslint-disable-next-line import/no-unresolved
import { Context, SQSEvent } from 'aws-lambda';
import { extract } from 'tar-stream';
import { aws, IngestionInput, integrity, requireEnv } from '../shared';

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
    const dotJsii = await new Promise<Buffer>((ok, ko) => {
      extract()
        .on('entry', (headers, stream, next) => {
          if (headers.name !== 'package/.jsii') {
            // Skip on next runLoop iteration so we avoid filling the stack.
            return setImmediate(next);
          }
          const chunks = new Array<Buffer>();
          return stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
            .once('error', ko)
            .once('end', () => {
              ok(Buffer.concat(chunks));
              next();
            })
            .resume();
        })
        .once('error', ko)
        .once('close', () => ko(new Error('No .jsii file found in tarball!')))
        .write(tar, (err) => {
          if (err != null) {
            ko(err);
          }
        });
    });
    const { name: packageName, version: packageVersion } = validateAssembly(JSON.parse(dotJsii.toString('utf-8')));

    const assemblyKey = `packages/${packageName}/v${packageVersion}/assembly.json`;
    const packageKey = `packages/${packageName}/v${packageVersion}/package.tgz`;

    const [assembly, pkg] = await Promise.all([
      aws.s3().putObject({
        Bucket: BUCKET_NAME,
        Key: assemblyKey,
        Body: dotJsii,
        ContentType: 'text/json',
        Metadata: {
          'Lambda-Log-Group': context.logGroupName,
          'Lambda-Log-Stream': context.logStreamName,
          'Lambda-Run-Id': context.awsRequestId,
        },
      }).promise(),
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
    ]);

    result.push({
      bucket: BUCKET_NAME,
      assembly: {
        key: assemblyKey,
        versionId: assembly.VersionId,
      },
      package: {
        key: packageKey,
        versionId: pkg.VersionId,
      },
    });
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
