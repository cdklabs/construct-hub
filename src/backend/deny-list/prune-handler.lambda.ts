import * as AWS from 'aws-sdk';
import { requireEnv } from '../shared/env.lambda-shared';
import { DenyListClient } from './client.lambda-shared';
import { ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME, ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX, ENV_PRUNE_QUEUE_URL } from './constants';

const s3 = new AWS.S3();
const sqs = new AWS.SQS();

export async function handler() {
  const client = new DenyListClient();
  await client.init();

  const packageData = requireEnv(ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME);
  const pruneQueue = requireEnv(ENV_PRUNE_QUEUE_URL);
  const keyPrefix = requireEnv(ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX);

  for (const nameVersion of Object.keys(client.map)) {
    const prefix = `${keyPrefix}${nameVersion}/`;
    console.log(`Querying bucket ${packageData} for all objects with prefix ${prefix}`);

    // for each prefix, query the package data bucket for all objects with that
    // prefix and delete them
    let continuation = undefined;
    do {
      const req: AWS.S3.ListObjectsV2Request = {
        Bucket: packageData,
        Prefix: prefix,
        ContinuationToken: continuation,
      };

      const result = await s3.listObjectsV2(req).promise();
      continuation = result.NextContinuationToken;

      const objects = result.Contents ?? [];
      if (objects.length > 0) {
        const sendMessageRequest: AWS.SQS.SendMessageBatchRequest = {
          QueueUrl: pruneQueue,
          Entries: objects.filter(o => o.Key).map((o, i) => ({ Id: `Object${i}`, MessageBody: o.Key! })),
        };

        console.log(JSON.stringify({ sendMessageRequest }));
        const sendMessageResponse = await sqs.sendMessageBatch(sendMessageRequest).promise();
        console.log(JSON.stringify({ sendMessageResponse }));
      }

    } while (continuation);
  }
}