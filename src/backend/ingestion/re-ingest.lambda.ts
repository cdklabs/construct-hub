import type { Context } from 'aws-lambda';
import type * as AWS from 'aws-sdk';
import * as aws from '../shared/aws.lambda-shared';
import { METADATA_KEY_SUFFIX, PACKAGE_KEY_SUFFIX } from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { integrity } from '../shared/integrity.lambda-shared';

interface Input {
  s3Object: AWS.S3.Object;
  params: { skipDocgen?: boolean };
}

export async function handler(event: Input, context: Context) {
  console.log('Event: ', JSON.stringify(event, null, 2));

  const bucket = requireEnv('BUCKET_NAME');
  const queueUrl = requireEnv('QUEUE_URL');

  const metadataKey = event.s3Object.Key;
  if (!metadataKey) {
    throw new Error('No key found.');
  }

  console.log(`Download metadata object at ${bucket}/${metadataKey}`);
  const { Body: jsonMetadata } = await aws.s3().getObject({ Bucket: bucket, Key: metadataKey }).promise();
  if (jsonMetadata == null) {
    console.error(`No body found in ${bucket}/${metadataKey}, aborting.`);
    return;
  }
  const { date: time } = JSON.parse(jsonMetadata.toString('utf-8'));

  const tarballKey = `${metadataKey.substr(0, metadataKey.length - METADATA_KEY_SUFFIX.length)}${PACKAGE_KEY_SUFFIX}`;
  console.log(`Download metadata object at ${bucket}/${tarballKey}`);
  const { Body: tarball, VersionId: versionId } = await aws.s3().getObject({ Bucket: bucket, Key: tarballKey }).promise();
  if (tarball == null) {
    console.error(`No body found in ${bucket}/${tarballKey}, aborting.`);
    return;
  }

  const ingestionInput = integrity({
    tarballUri: `s3://${bucket}/${tarballKey}${versionId ? `?versionId=${versionId}` : ''}`,
    time,
    metadata: {
      reprocessRequestId: context.awsRequestId,
      reprocessLogGroup: context.logGroupName,
      reprocessLogStream: context.logStreamName,
    },
    skipDocgen: event.params?.skipDocgen,
  }, Buffer.from(tarball));

  console.log(`Sending message to reprocess queue: ${JSON.stringify(ingestionInput, null, 2)}`);
  return aws.sqs().sendMessage({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(ingestionInput, null, 2),
    MessageAttributes: {
      'Reprocess-RequestID': { DataType: 'String', StringValue: context.awsRequestId },
      'Reprocess-LogGroup': { DataType: 'String', StringValue: context.logGroupName },
      'Reprocess-LogStream': { DataType: 'String', StringValue: context.logStreamName },
    },
  }).promise();
}
