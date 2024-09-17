import { GetObjectCommand } from '@aws-sdk/client-s3';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import type { Context } from 'aws-lambda';
import { S3_CLIENT, SQS_CLIENT } from '../shared/aws.lambda-shared';
import { METADATA_KEY_SUFFIX, PACKAGE_KEY_SUFFIX } from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { integrity } from '../shared/integrity.lambda-shared';
import { now } from '../shared/time.lambda-shared';

interface Input {
  Key: string;
}

export async function handler(event: Input, context: Context) {
  console.log('Event: ', JSON.stringify(event, null, 2));

  const bucket = requireEnv('BUCKET_NAME');
  const queueUrl = requireEnv('QUEUE_URL');
  const age = requireEnv('REPROCESS_AGE_MILLIS');

  console.log(`Download metadata object at ${bucket}/${event.Key}`);
  const { Body: jsonMetadata } = await S3_CLIENT.send(
    new GetObjectCommand({ Bucket: bucket, Key: event.Key })
  );
  if (jsonMetadata == null) {
    console.error(`No body found in ${bucket}/${event.Key}, aborting.`);
    return;
  }
  const { date: time } = JSON.parse(
    await jsonMetadata.transformToString('utf-8')
  );

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
  const { Body: tarball, VersionId: versionId } = await S3_CLIENT.send(
    new GetObjectCommand({ Bucket: bucket, Key: tarballKey })
  );
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
    await tarball.transformToByteArray()
  );

  console.log(
    `Sending message to reprocess queue: ${JSON.stringify(
      ingestionInput,
      null,
      2
    )}`
  );
  return SQS_CLIENT.send(
    new SendMessageCommand({
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
  );
}

function isYoungEnough(publishDate: string, historyTimeWindow: number) {
  const publish = new Date(publishDate).getTime();
  return publish + historyTimeWindow >= now();
}
