import type { Context } from 'aws-lambda';
import type * as AWS from 'aws-sdk';
import * as aws from '../shared/aws.lambda-shared';
import { METADATA_KEY_SUFFIX, PACKAGE_KEY_SUFFIX } from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { integrity } from '../shared/integrity.lambda-shared';

interface Input extends AWS.S3.Object {
  Key: string;
}

export async function handler(event: Input, context: Context) {
  console.log('Event: ', JSON.stringify(event, null, 2));

  const bucket = requireEnv('BUCKET_NAME');
  const queueUrl = requireEnv('QUEUE_URL');
  const age = requireEnv('REPROCESS_AGE');

  console.log(`Download metadata object at ${bucket}/${event.Key}`);
  const { Body: jsonMetadata } = await aws
    .s3()
    .getObject({ Bucket: bucket, Key: event.Key })
    .promise();
  if (jsonMetadata == null) {
    console.error(`No body found in ${bucket}/${event.Key}, aborting.`);
    return;
  }
  const { date: time } = JSON.parse(jsonMetadata.toString('utf-8'));

  const tarballKey = `${event.Key.substr(
    0,
    event.Key.length - METADATA_KEY_SUFFIX.length
  )}${PACKAGE_KEY_SUFFIX}`;

  if (!isYoungEnough(time, Number(age))) {
    console.log(
      `Tarball ${tarballKey} has been published too far in the past (${age}). Not reprocessing`
    );
    return;
  }
  console.log(`Download tarball object at ${bucket}/${tarballKey}`);
  const { Body: tarball, VersionId: versionId } = await aws
    .s3()
    .getObject({ Bucket: bucket, Key: tarballKey })
    .promise();
  if (tarball == null) {
    console.error(`No body found in ${bucket}/${tarballKey}, aborting.`);
    return;
  }

  const ingestionInput = integrity(
    {
      tarballUri: `s3://${bucket}/${tarballKey}${
        versionId ? `?versionId=${versionId}` : ''
      }`,
      time,
      reIngest: true,
      metadata: {
        reprocessRequestId: context.awsRequestId,
        reprocessLogGroup: context.logGroupName,
        reprocessLogStream: context.logStreamName,
      },
    },
    Buffer.from(tarball as any)
  );

  console.log(
    `Sending message to reprocess queue: ${JSON.stringify(
      ingestionInput,
      null,
      2
    )}`
  );
  return aws
    .sqs()
    .sendMessage({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(ingestionInput, null, 2),
      MessageAttributes: {
        'Reprocess-RequestID': {
          DataType: 'String',
          StringValue: context.awsRequestId,
        },
        'Reprocess-LogGroup': {
          DataType: 'String',
          StringValue: context.logGroupName,
        },
        'Reprocess-LogStream': {
          DataType: 'String',
          StringValue: context.logStreamName,
        },
      },
    })
    .promise();
}

function isYoungEnough(publishDate: string, historyTimeWindow: number) {
  const now = Date.now();
  const publish = new Date(publishDate).getTime();
  return publish + historyTimeWindow >= now;
}
