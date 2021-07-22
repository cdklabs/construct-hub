import * as AWS from 'aws-sdk';
import { requireEnv } from '../../../../backend/shared/env.lambda-shared';

const s3 = new AWS.S3();

export async function handler() {
  const bucketName = requireEnv('BUCKET_NAME');
  const timeoutSec = parseInt(requireEnv('TIMEOUT_SEC'));
  const expected = JSON.parse(requireEnv('EXPECTED_KEYS'));

  console.log(JSON.stringify({ expected }));

  const startTime = Date.now();
  let keys;
  while ((Date.now() - startTime) / 1000 < timeoutSec) {
    keys = await getAllObjectKeys(bucketName);
    console.log(JSON.stringify({ keys }));

    if (JSON.stringify(keys.sort()) === JSON.stringify(expected.sort())) {
      console.log('assertion succeeded');
      return;
    }
  }

  throw new Error(`assertion failed. the following objects were not deleted after ${timeoutSec}s. Actual: ${JSON.stringify(keys)}. Expected: ${JSON.stringify(expected)}`);
}

async function getAllObjectKeys(bucket: string) {
  let continuationToken;
  const objectKeys = new Array<string>();
  do {
    const listRequest: AWS.S3.ListObjectsV2Request = {
      Bucket: bucket,
      ContinuationToken: continuationToken,
    };
    console.log(JSON.stringify({ req: listRequest }));
    const listResponse = await s3.listObjectsV2(listRequest).promise();
    console.log(JSON.stringify({ listResponse }));
    continuationToken = listResponse.NextContinuationToken;

    for (const obj of listResponse.Contents ?? []) {
      if (!obj.Key) { continue; }
      objectKeys.push(obj.Key);
    }

  } while (continuationToken);

  return objectKeys;
}