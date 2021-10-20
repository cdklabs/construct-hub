import * as https from 'https';
import { URL } from 'url';
import type { Context, SQSEvent } from 'aws-lambda';
import { DenyListClient } from '../../backend/deny-list/client.lambda-shared';
import { s3, sqs } from '../../backend/shared/aws.lambda-shared';
import { requireEnv } from '../../backend/shared/env.lambda-shared';
import { integrity } from '../../backend/shared/integrity.lambda-shared';
import { S3KeyPrefix } from './constants.lambda-shared';

/**
 * This function is invoked by the `npm-js-follower.lambda`  with a `PackageVersion` object, or by
 * an SQS trigger feeding from this function's Dead-Letter Queue (for re-trying purposes).
 *
 * The payload contains information about a discovered new package version. This handler will
 * check the package is not deny-listed, download the tarball from the payload's `tarballUrl`, store
 * it in the staging bucket, then send a message to the ConstructHub ingestion SQS queue in order to
 * trigger ingestion of this package.
 */
export async function handler(event: PackageVersion | SQSEvent, context: Context): Promise<void> {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  if ('Records' in event) {
    // ATTENTION: Assumes there is only exactly 1 event in there...
    event = JSON.parse(event.Records[0].body) as PackageVersion;
    console.log(`Event (extracted): ${JSON.stringify(event, null, 2)}`);
  }

  const stagingBucket = requireEnv('BUCKET_NAME');
  const queueUrl = requireEnv('QUEUE_URL');

  const denyList = await DenyListClient.newClient();
  const denyRule = denyList.lookup(event.name, event.version);
  if (denyRule != null) {
    console.log(`Package was deny-listed: ${denyRule.reason}`);
    return;
  }

  // Download the tarball
  console.log(`Downloading tarball from URL: ${event.tarballUrl}`);
  const tarball = await httpGet(event.tarballUrl);

  // Store the tarball into the staging bucket
  // - infos.dist.tarball => https://registry.npmjs.org/<@scope>/<name>/-/<name>-<version>.tgz
  // - stagingKey         =>                     staged/<@scope>/<name>/-/<name>-<version>.tgz
  const stagingKey = `${S3KeyPrefix.STAGED_KEY_PREFIX}${new URL(event.tarballUrl).pathname}`.replace(/\/{2,}/g, '/');
  console.log(`Storing tarball in staging bucket with key ${stagingKey}`);
  await s3().putObject({
    Bucket: stagingBucket,
    Key: stagingKey,
    Body: tarball,
    ContentType: 'application/octet-stream',
    Metadata: {
      'Lambda-Log-Group': context.logGroupName,
      'Lambda-Log-Stream': context.logStreamName,
      'Lambda-Run-Id': context.awsRequestId,
      'Modified-At': event.modified,
      'Origin-Integrity': event.integrity,
      'Origin-URI': event.tarballUrl,
      'Sequence': event.seq,
    },
  }).promise();

  // Prepare ingestion request
  const message = integrity(
    {
      tarballUri: `s3://${stagingBucket}/${stagingKey}`,
      metadata: {
        dist: event.tarballUrl,
        integrity: event.integrity,
        modified: event.modified,
        seq: event.seq,
      },
      time: event.modified,
    },
    tarball,
  );

  // Send message to SQS
  console.log(`Sending message to ConstructHub ingestion queue: ${JSON.stringify(message, null, 2)}`);
  await sqs().sendMessage({
    MessageBody: JSON.stringify(message, null, 2),
    MessageAttributes: {
      'Lambda-Log-Group': { DataType: 'String', StringValue: context.logGroupName },
      'Lambda-Log-Stream': { DataType: 'String', StringValue: context.logStreamName },
      'Lambda-Run-Id': { DataType: 'String', StringValue: context.awsRequestId },
    },
    QueueUrl: queueUrl,
  }).promise();
}

export interface PackageVersion {
  readonly name: string;
  readonly version: string;
  readonly modified: string;

  readonly tarballUrl: string;
  readonly integrity: string;

  readonly seq: string;
}

/**
 * Makes an HTTP GET request, and returns the resulting payload.
 *
 * @param url the URL to get.
 *
 * @returns a Buffer containing the received data.
 */
function httpGet(url: string) {
  return new Promise<Buffer>((ok, ko) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        ko(new Error(`Unsuccessful GET: ${response.statusCode} - ${response.statusMessage}`));
      }

      let body = Buffer.alloc(0);
      response.on('data', (chunk) => body = Buffer.concat([body, Buffer.from(chunk)]));
      response.once('close', () => ok(body));
      response.once('error', ko);
    });
  });
}
