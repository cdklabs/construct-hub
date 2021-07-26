import * as AWS from 'aws-sdk';
import { requireEnv } from '../shared/env.lambda-shared';
import { ENV_DELETE_OBJECT_CATALOG_REBUILD_FUNCTION_NAME, ENV_DELETE_OBJECT_DATA_BUCKET_NAME } from './constants';

const s3 = new AWS.S3();
const lambda = new AWS.Lambda();

export async function handler(event: AWSLambda.SQSEvent) {
  console.log(JSON.stringify({ event }));

  const bucket = requireEnv(ENV_DELETE_OBJECT_DATA_BUCKET_NAME);
  const catalogRebuildFunctionName = requireEnv(ENV_DELETE_OBJECT_CATALOG_REBUILD_FUNCTION_NAME);

  const records = event.Records ?? [];

  for (const record of records) {
    const objectKey = record.body;
    console.log(`deleting s3://${bucket}/${objectKey}`);
    await s3.deleteObject({ Bucket: bucket, Key: objectKey }).promise();
  }

  // trigger a catalog rebuild since we deleted some files
  if (records.length > 0) {
    console.log('triggering a catalog rebuild');
    const catalogRebuildRequest: AWS.Lambda.InvocationRequest = {
      FunctionName: catalogRebuildFunctionName,
      InvocationType: 'Event',
    };
    console.log(JSON.stringify({ invokeReq: catalogRebuildRequest }));
    const catalogRebuildResponse = await lambda.invoke(catalogRebuildRequest).promise();
    console.log(JSON.stringify({ invokeRes: catalogRebuildResponse }));
  }
}