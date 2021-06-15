import { URL } from 'url';

import { validateAssembly } from '@jsii/spec';
// eslint-disable-next-line import/no-unresolved
import { Context, SQSEvent } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import { extract } from 'tar-stream';
import { IngestionInput, integrity } from '../shared';

let s3: S3 | undefined;

export async function handler(event: SQSEvent, context: Context) {
  const BUCKET_NAME = requireEnv('BUCKET_NAME');
  if (s3 == null) {
    s3 = new S3();
  }

  const result = new Array<CreatedObject>();

  for (const record of event.Records ?? []) {
    const payload = JSON.parse(record.body) as IngestionInput;

    const tarballUri = new URL(payload.tarballUri);
    if (tarballUri.protocol !== 's3') {
      throw new Error(`Unsupported protocol in URI: ${tarballUri}`);
    }
    const tarball = await s3.getObject({
      // Note: we drop anything after the first `.` in the host, as we only care about the bucket name.
      Bucket: tarballUri.host.split('.')[0],
      Key: tarballUri.pathname,
      VersionId: tarballUri.searchParams.get('versionId') ?? undefined,
    }).promise();

    const integrityCheck = integrity(payload, Buffer.from(tarball.Body!));
    if (payload.integrity !== integrityCheck) {
      throw new Error(`Integrity check failed: ${payload.integrity} !== ${integrityCheck}`);
    }

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
        .write(Buffer.from(tarball.Body!), (err) => {
          if (err != null) {
            ko(err);
          }
        });
    });
    const { name: packageName, version: packageVersion } = validateAssembly(JSON.parse(dotJsii.toString('utf-8')));

    const assemblyKey = `packages/${packageName}/v${packageVersion}/assembly.json`;
    const packageKey = `packages/${packageName}/v${packageVersion}/package.tgz`;

    const [assembly, pkg] = await Promise.all([
      s3.putObject({
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
      s3.putObject({
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

function requireEnv(name: string): string {
  const result = process.env[name];
  if (!result) {
    throw new Error(`No value provided for required environment variable "${name}"`);
  }
  return result;
}

/**
 * Visible for testing. Resets the S3 client used for running this function.
 */
export function reset() {
  s3 = undefined;
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
