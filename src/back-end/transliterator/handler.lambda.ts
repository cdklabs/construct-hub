import { spawn } from 'child_process';
import * as console from 'console';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as process from 'process';

// eslint-disable-next-line import/no-unresolved
import type { Context, S3Event } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import { TargetLanguage } from 'jsii-rosetta';
import { transliterateAssembly } from 'jsii-rosetta/lib/commands/transliterate';

const clients = new Map<string, S3>();
const PACKAGE_KEY_REGEX = /^packages\/((?:@[^/]+\/)?[^/]+)\/v([^/]+)\/package.tgz$/;

/**
 * This function receives an S3 event, and for each record, proceeds to download
 * the `.jsii` assembly the event refers to, transliterates it to Python, then
 * uploads the resulting `.jsii.python` object to S3.
 *
 * @param event   an S3 event payload
 * @param context a Lambda execution context
 *
 * @returns nothing
 */
export async function handler(event: S3Event, context: Context): Promise<readonly S3Object[]> {
  console.error(JSON.stringify(event, null, 2));

  const created = new Array<S3Object>();

  for (const record of event.Records) {
    const [, packageName, packageVersion] = record.s3.object.key.match(PACKAGE_KEY_REGEX) ?? [];
    if (packageName == null) {
      throw new Error(`Invalid object key: "${record.s3.object.key}". It was expected to match ${PACKAGE_KEY_REGEX}!`);
    }

    const client = (clients.has(record.awsRegion)
      ? clients
      : clients.set(record.awsRegion, new S3({ region: record.awsRegion }))
    ).get(record.awsRegion)!;

    const object = await client.getObject({
      Bucket: record.s3.bucket.name,
      Key: record.s3.object.key,
      VersionId: record.s3.object.versionId,
    }).promise();

    const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'workdir'));
    try {
      const tarball = path.join(workdir, `${packageName.replace('@', '').replace('/', '-')}-${packageVersion}.tgz`);
      await fs.writeFile(tarball, object.Body!);
      await new Promise<void>((ok, ko) => {
        const npmInstall = spawn('npm', ['install', '--ignore-scripts', '--no-bin-links', '--no-save', tarball], {
          cwd: workdir,
          env: {
            ...process.env,
            HOME: os.tmpdir(), // npm fails with EROFS if $HOME is read-only, event if it won't write there
          },
          stdio: ['ignore', 'inherit', 'inherit'],
        });
        npmInstall.once('error', ko);
        npmInstall.once('close', (code, signal) => {
          if (code === 0) {
            ok();
          } else {
            ko(`"npm install" command ${code != null ? `exited with code ${code}` : `was terminated by signal ${signal}`}`);
          }
        });
      });
      const packageDir = path.join(workdir, 'node_modules', packageName);

      await transliterateAssembly(
        [packageDir],
        [TargetLanguage.PYTHON], // TODO: allow configuring this
      );

      const key = record.s3.object.key.replace(/\/[^/]+$/, '/assembly-python.json');
      const response = await client.putObject({
        Bucket: record.s3.bucket.name,
        Key: key,
        Body: await fs.readFile(path.join(packageDir, '.jsii.python')),
        ContentType: 'text/json',
        Metadata: {
          'Origin-Version-Id': record.s3.object.versionId ?? 'N/A',
          'Lambda-Log-Group': context.logGroupName,
          'Lambda-Log-Stream': context.logStreamName,
          'Lambda-Run-Id': context.awsRequestId,
        },
      }).promise();
      created.push({
        bucket: record.s3.bucket.name,
        key,
        versionId: response.VersionId,
      });
    } finally {
      await fs.rmdir(workdir, { recursive: true });
    }
  }
  return created;
}

interface S3Object {
  readonly bucket: string;
  readonly key: string;
  readonly versionId?: string;
}
