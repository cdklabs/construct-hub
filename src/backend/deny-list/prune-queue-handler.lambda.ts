import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SQSEvent } from 'aws-lambda';
import { ENV_DELETE_OBJECT_DATA_BUCKET_NAME } from './constants';
import { requireEnv } from '../shared/env.lambda-shared';

export async function handler(event: SQSEvent) {
  const s3Client = new S3Client({});
  console.log(JSON.stringify({ event }));

  const bucket = requireEnv(ENV_DELETE_OBJECT_DATA_BUCKET_NAME);

  const records = event.Records ?? [];

  for (const record of records) {
    const objectKey = record.body;
    console.log(`deleting s3://${bucket}/${objectKey}`);
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: objectKey })
    );
  }
}
