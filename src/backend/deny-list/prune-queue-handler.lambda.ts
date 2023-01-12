import * as AWS from 'aws-sdk';
import { ENV_DELETE_OBJECT_DATA_BUCKET_NAME } from './constants';
import { requireEnv } from '../shared/env.lambda-shared';

const s3 = new AWS.S3();

export async function handler(event: AWSLambda.SQSEvent) {
  console.log(JSON.stringify({ event }));

  const bucket = requireEnv(ENV_DELETE_OBJECT_DATA_BUCKET_NAME);

  const records = event.Records ?? [];

  for (const record of records) {
    const objectKey = record.body;
    console.log(`deleting s3://${bucket}/${objectKey}`);
    await s3.deleteObject({ Bucket: bucket, Key: objectKey }).promise();
  }
}
