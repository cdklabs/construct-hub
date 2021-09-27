import type { Context } from 'aws-lambda';
import * as aws from '../../backend/shared/aws.lambda-shared';
import { requireEnv } from '../../backend/shared/env.lambda-shared';

export async function handler(_event: unknown, context: Context): Promise<void> {
  const bucketName = requireEnv('BUCKET_NAME');
  const fileName = requireEnv('FILE_NAME');
  const fileContents = requireEnv('FILE_CONTENTS');

  console.log(`BUCKET_NAME: ${bucketName}`);
  console.log(`FILE_NAME: ${fileName}`);
  console.log(`FILE_CONTENTS: ${fileContents}`);

  if (!await aws.s3ObjectExists(bucketName, fileName)) {
    await aws.s3().putObject({
      Bucket: bucketName,
      Key: fileName,
      Body: fileContents,
      ContentType: 'application/json',
      Metadata: {
        'Lambda-Log-Group': context.logGroupName,
        'Lambda-Log-Stream': context.logStreamName,
        'Lambda-Run-Id': context.awsRequestId,
      },
    }).promise();
    console.log('File created.');
  } else {
    console.log('File already exists.');
  }
}
