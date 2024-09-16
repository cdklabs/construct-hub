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
import * as _AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk-core';

// Do nothing if there is no XRay trace context
AWSXRay.setContextMissingStrategy(() => {});

const AWS = AWSXRay.captureAWS(_AWS);

export const S3_CLIENT: S3Client = AWSXRay.captureAWSv3Client(new S3Client({}));
export const LAMBDA_CLIENT: LambdaClient = AWSXRay.captureAWSv3Client(
  new LambdaClient({})
);
export const ECS_CLIENT: ECSClient = AWSXRay.captureAWSv3Client(
  new ECSClient({})
);
export const SQS_CLIENT: SQSClient = AWSXRay.captureAWSv3Client(
  new SQSClient()
);
export const SFN_CLIENT: SFNClient = AWSXRay.captureAWSv3Client(
  new SFNClient()
);

let _s3: AWS.S3 | undefined;
let _sqs: AWS.SQS | undefined;
let _lambda: AWS.Lambda | undefined;

export function s3(): AWS.S3 {
  if (_s3 == null) {
    _s3 = new AWS.S3();
  }
  return _s3;
}

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

export function sqs(): AWS.SQS {
  if (_sqs == null) {
    _sqs = new AWS.SQS();
  }
  return _sqs;
}

export function lambda(): AWS.Lambda {
  if (_lambda == null) {
    _lambda = new AWS.Lambda();
  }
  return _lambda;
}
