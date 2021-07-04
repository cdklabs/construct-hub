import * as console from 'console';

// eslint-disable-next-line import/no-unresolved
import type { Context, S3Event } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import { Documentation } from 'jsii-docgen';
import { TargetLanguage } from 'jsii-rosetta';

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

    const docs = await Documentation.forRemotePackage(packageName, packageVersion);
    const artifact = constants.docsKeySuffix(TargetLanguage.PYTHON);
    const key = inputKey.replace(/\/[^/]+$/, artifact);

    const response = await client.putObject({
      Bucket: record.s3.bucket.name,
      Key: key,
      Body: docs.render(),
      ContentType: 'text/html',
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
