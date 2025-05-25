import { ECSClient } from '@aws-sdk/client-ecs';
import { LambdaClient } from '@aws-sdk/client-lambda';
import {
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  S3Client,
} from '@aws-sdk/client-s3';
import { SFNClient } from '@aws-sdk/client-sfn';
import { SQSClient } from '@aws-sdk/client-sqs';
import * as AWSXRay from 'aws-xray-sdk-core';

// Do nothing if there is no XRay trace context
AWSXRay.setContextMissingStrategy(() => {});

export const S3_CLIENT = AWSXRay.captureAWSv3Client(new S3Client({}));
export const LAMBDA_CLIENT = AWSXRay.captureAWSv3Client(new LambdaClient({}));
export const ECS_CLIENT = AWSXRay.captureAWSv3Client(new ECSClient({}));
export const SQS_CLIENT = AWSXRay.captureAWSv3Client(new SQSClient());
export const SFN_CLIENT = AWSXRay.captureAWSv3Client(new SFNClient());

/**
 * Checks whether an object exists in S3 at the provided bucket and key.
 */
export async function s3ObjectExists(
  bucket: string,
  key: string
): Promise<boolean> {
  try {
    await S3_CLIENT.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch (cause: any) {
    if (
      cause instanceof NoSuchKey ||
      cause.name === 'NoSuchKey' ||
      cause instanceof NotFound ||
      cause.name === 'NotFound'
    ) {
      return false;
    }
    throw cause;
  }
}
