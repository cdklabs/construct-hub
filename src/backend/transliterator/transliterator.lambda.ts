import { spawn } from 'child_process';
import * as console from 'console';
import * as os from 'os';
import * as path from 'path';
import * as process from 'process';

// eslint-disable-next-line import/no-unresolved
import type { Context, S3Event } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import * as fs from 'fs-extra';
import { TargetLanguage } from 'jsii-rosetta';
import { transliterateAssembly } from 'jsii-rosetta/lib/commands/transliterate';

import * as constants from '../shared/constants.lambda-shared';

const clients = new Map<string, S3>();

const PACKAGE_KEY_REGEX = new RegExp(`^${constants.STORAGE_KEY_PREFIX}((?:@[^/]+/)?[^/]+)/v([^/]+)${constants.PACKAGE_KEY_SUFFIX}$`);
// Capture groups:                                                    ┗━━━━━━━━━1━━━━━━━┛  ┗━━2━━┛

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
  console.log(JSON.stringify(event, null, 2));

  const created = new Array<S3Object>();

  for (const record of event.Records) {
    // Key names are escaped (`@` as `%40`) in the input payload... Decode it here... We cannot use
    // `decodeURI` here because it does not undo encoding that `encodeURI` would not have done, and
    // that would not replace `@` in the position where it is in the keys... So we have to work on
    // the URI components instead.
    const inputKey = record.s3.object.key.split('/').map((comp) => decodeURIComponent(comp)).join('/');
    const [, packageName, packageVersion] = inputKey.match(PACKAGE_KEY_REGEX) ?? [];
    if (packageName == null) {
      throw new Error(`Invalid object key: "${inputKey}". It was expected to match ${PACKAGE_KEY_REGEX}!`);
    }

    const client = (clients.has(record.awsRegion)
      ? clients
      : clients.set(record.awsRegion, new S3({ region: record.awsRegion }))
    ).get(record.awsRegion)!;

    console.log(`Source Bucket:  ${record.s3.bucket.name}`);
    console.log(`Source Key:     ${inputKey}`);
    console.log(`Source Version: ${record.s3.object.versionId}`);

    const object = await client.getObject({
      Bucket: record.s3.bucket.name,
      Key: inputKey,
      VersionId: record.s3.object.versionId,
    }).promise();

    const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'workdir'));
    try {
      const tarball = path.join(workdir, `${packageName.replace('@', '').replace('/', '-')}-${packageVersion}.tgz`);
      await fs.writeFile(tarball, object.Body!);
      await new Promise<void>((ok, ko) => {
        // --ignore-scripts disables lifecycle hooks, in order to prevent execution of arbitrary code
        // --no-bin-links ensures npm does not insert anything in $PATH
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
      const packageDir = path.join(workdir, 'node_modules', ...packageName.split('/'));

      await transliterateAssembly(
        [packageDir],
        [TargetLanguage.PYTHON], // TODO: allow configuring this
      );

      // Payload object key => packages/[<@scope>/]<name>/v<version>/package.tgz
      // Output object key  => packages/[<@scope>/]<name>/v<version>/assembly-python.json
      const key = inputKey.replace(/\/[^/]+$/, constants.assemblyKeySuffix(TargetLanguage.PYTHON));
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
      await fs.remove(workdir);
    }
  }
  return created;
}

/**
 * Visible for testing. Clears the caches so that the next execution runs clean.
 */
export function reset() {
  clients.clear();
}

interface S3Object {
  readonly bucket: string;
  readonly key: string;
  readonly versionId?: string;
}
