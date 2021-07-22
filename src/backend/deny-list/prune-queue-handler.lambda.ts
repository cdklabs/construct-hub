import * as AWS from 'aws-sdk';
import { requireEnv } from '../shared/env.lambda-shared';
import { ENV_DELETE_OBJECT_DATA_BUCKET_NAME } from './constants';

const s3 = new AWS.S3();

export async function handler(event: AWSLambda.SQSEvent) {
  const bucket = requireEnv(ENV_DELETE_OBJECT_DATA_BUCKET_NAME);
  for (const record of event.Records) {
    const objectKey = record.body;
    console.log(`deleting s3://${bucket}/${objectKey}`);
    await s3.deleteObject({ Bucket: bucket, Key: objectKey }).promise();
  }
}