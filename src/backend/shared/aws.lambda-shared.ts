import * as AWS from 'aws-sdk';

let _s3: AWS.S3 | undefined;
let _sqs: AWS.SQS | undefined;
let _sfn: AWS.StepFunctions | undefined;

export function s3(): AWS.S3 {
  if (_s3 == null) {
    _s3 = new AWS.S3();
  }
  return _s3;
}

/**
 * Checks whether an object exists in S3 at the provided bucket and key.
 */
export function s3ObjectExists(bucket: string, key: string): Promise<boolean> {
  return s3().headObject({
    Bucket: bucket,
    Key: key,
  }).promise()
    .then(
      () => true,
      (cause) => {
        if (cause.code === 'NotFound') {
          return false;
        }
        return Promise.reject(cause);
      },
    );
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

/**
 * Resets all clients vended by this module. This is useful in unit tests when
 * `aws-sdk-mocks` is used, so that new mocks are injected as intended.
 */
export function reset(): void {
  _s3 = _sqs = _sfn = undefined;
}
