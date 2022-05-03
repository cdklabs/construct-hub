import * as AWS from 'aws-sdk';
import { requireEnv } from '../../../../backend/shared/env.lambda-shared';

const s3 = new AWS.S3();

export async function handler() {
  const bucketName = requireEnv('BUCKET_NAME');
  const timeoutSec = parseInt(requireEnv('TIMEOUT_SEC'));
  const expectedKeys = JSON.parse(requireEnv('EXPECTED_KEYS'));
  const expected = canonicalRepresentation(expectedKeys);

  console.log(JSON.stringify({ expected: expectedKeys }));

  const startTime = Date.now();
  let actual;
  while ((Date.now() - startTime) / 1000 < timeoutSec) {
    actual = canonicalRepresentation(await getAllObjectKeys(bucketName));
    console.log(JSON.stringify({ keys: actual }));

    if (actual === expected) {
      console.log('assertion succeeded');
      return;
    }
  }

  throw new Error(
    `assertion failed. the following objects were not deleted after ${timeoutSec}s. Actual: ${actual}. Expected: ${expected}`
  );
}

async function getAllObjectKeys(bucket: string) {
  let continuationToken;
  const objectKeys = new Array<string>();
  do {
    const listRequest: AWS.S3.ListObjectsV2Request = {
      Bucket: bucket,
      ContinuationToken: continuationToken,
    };
    console.log(JSON.stringify({ listRequest }));
    const listResponse = await s3.listObjectsV2(listRequest).promise();
    console.log(JSON.stringify({ listResponse }));
    continuationToken = listResponse.NextContinuationToken;

    for (const { Key: key } of listResponse.Contents ?? []) {
      if (!key) {
        continue;
      }
      objectKeys.push(key);
    }
  } while (continuationToken);

  return objectKeys;
}

function canonicalRepresentation(list: string[]) {
  return JSON.stringify(list.sort());
}
