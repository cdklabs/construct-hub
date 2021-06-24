import * as console from 'console';

import type { Context } from 'aws-lambda';
import * as AWS from 'aws-sdk';

let _s3: AWS.S3 | undefined;
let _sqs: AWS.SQS | undefined;

export function s3(): AWS.S3 {
  if (_s3 == null) {
    _s3 = new AWS.S3();
  }
  return _s3;
}

/**
 * Puts an object in an S3 bucket while adding metadata corresponding to the
 * current Lambda context.
 *
 * @param context the Lambda context that is being used.
 * @param bucket  the S3 bucket where to put the object.
 * @param key     the S3 key to be used.
 * @param body    the body of the object to be put.
 * @param opts    additional options for the S3 request.
 */
export function s3PutObject(
  context: Context,
  bucket: string,
  key: string,
  body: AWS.S3.Body,
  opts: Omit<AWS.S3.PutObjectRequest, 'Bucket' | 'Key' | 'Body'> = {},
) {
  return s3().putObject({
    Bucket: bucket,
    Key: key,
    Body: body,
    Metadata: {
      'Lambda-Log-Group': context.logGroupName,
      'Lambda-Log-Stream': context.logStreamName,
      'Lambda-Run-Id': context.awsRequestId,
      ...opts.Metadata,
    },
    ...opts,
  }).promise();
}

export function sqs(): AWS.SQS {
  if (_sqs == null) {
    _sqs = new AWS.SQS();
  }
  return _sqs;
}

/**
 * Sends the supplied messages to the designated SQS queue url using the
 * `SendMessageBatch` API, for maximum throughput. This encodes the provided
 * messages using `JSON.stringify` and creates batches as large as possible.
 *
 * @param queueUrl the URL of the queue where to send the messages
 * @param messages the messages to be sent
 */
export async function sqsSendMessageBatch(queueUrl: string, messages: any[]): Promise<void> {
  for (const batch of batchedMessages()) {
    const result = await sqs().sendMessageBatch({ Entries: batch, QueueUrl: queueUrl }).promise();
    if (result.Failed.length > 0) {
      for (const { Id, SenderFault, Code, Message } of result.Failed) {
        const faultType = SenderFault ? 'sender fault' : 'server fault';
        const payload = batch.find((msg) => msg.Id === Id)?.MessageBody;
        console.error(`Failed sending message ${Id} due to a ${faultType} (${Code} - ${Message}): ${payload}`);
      }
      throw new Error(`Failed to send ${result.Failed.length} messages!`);
    }
  }

  /**
   * The SQS.SendMessageBatch call allows to batch up messages for up to 256KiB
   * (262_144 bytes) worth of message data, or up to 10 messages (whicever
   * happens first). This generator batches the provided messages in such a way
   * that this limit is consistently maxed out.
   *
   * @param messages the messages to be batched. They will be stringified using
   *                 `JSON.stringify` with no indentation setting.
   */
  function* batchedMessages(): Generator<AWS.SQS.SendMessageBatchRequestEntry[]> {
    const MAX_PAYLOAD_SIZE = 262_144;
    let batch = new Array<AWS.SQS.SendMessageBatchRequestEntry>();
    let totalPayloadSize = 0;

    for (const message of messages) {
      const payload = JSON.stringify(message);
      const payloadSize = Buffer.from(payload, 'utf-8').length;
      if (totalPayloadSize + payloadSize > MAX_PAYLOAD_SIZE || batch.length === 10) {
        yield batch;
        batch = [];
        totalPayloadSize = 0;
      }
      batch.push({ Id: batch.length.toFixed(), MessageBody: payload });
      totalPayloadSize += payloadSize;
    }

    if (batch.length > 0) {
      yield batch;
    }
  }
}

/**
 * Resets all clients vended by this module. This is useful in unit tests when
 * `aws-sdk-mocks` is used, so that new mocks are injected as intended.
 */
export function reset(): void {
  _s3 = _sqs = undefined;
}
