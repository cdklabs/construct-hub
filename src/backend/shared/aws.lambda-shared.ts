import { ECSClient } from '@aws-sdk/client-ecs';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as _AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk-core';

// Do nothing if there is no XRay trace context
AWSXRay.setContextMissingStrategy(() => {});

const AWS = AWSXRay.captureAWS(_AWS);

export const s3Client: S3Client = AWSXRay.captureAWSv3Client(new S3Client({}));
export const ecsClient: ECSClient = AWSXRay.captureAWSv3Client(
  new ECSClient({})
);

let _ecs: AWS.ECS | undefined;
let _s3: AWS.S3 | undefined;
let _sqs: AWS.SQS | undefined;
let _sfn: AWS.StepFunctions | undefined;
let _lambda: AWS.Lambda | undefined;
let _codeArtifact: AWS.CodeArtifact | undefined;

export function ecs(): AWS.ECS {
  if (_ecs == null) {
    _ecs = new AWS.ECS();
  }
  return _ecs;
}

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
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch (cause: any) {
    if (cause.code === 'NotFound') {
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

export function stepFunctions(): AWS.StepFunctions {
  if (_sfn == null) {
    _sfn = new AWS.StepFunctions();
  }
  return _sfn;
}

export function lambda(): AWS.Lambda {
  if (_lambda == null) {
    _lambda = new AWS.Lambda();
  }
  return _lambda;
}

export function codeArtifact(): AWS.CodeArtifact {
  if (_codeArtifact == null) {
    _codeArtifact = new AWS.CodeArtifact();
  }
  return _codeArtifact;
}

/**
 * Resets all clients vended by this module. This is useful in unit tests when
 * `aws-sdk-mocks` is used, so that new mocks are injected as intended.
 */
export function reset(): void {
  _ecs = _s3 = _sqs = _sfn = _lambda = _codeArtifact = undefined;
}
