import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SQSEvent } from 'aws-lambda';
import { ENV_DELETE_OBJECT_DATA_BUCKET_NAME } from './constants';
import { S3_CLIENT } from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';

export async function handler(event: SQSEvent) {
  console.log(JSON.stringify({ event }));

  const bucket = requireEnv(ENV_DELETE_OBJECT_DATA_BUCKET_NAME);

  const records = event.Records ?? [];

  for (const record of records) {
    const objectKey = record.body;
    console.log(`deleting s3://${bucket}/${objectKey}`);
    await S3_CLIENT.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: objectKey })
    );
  }
}
