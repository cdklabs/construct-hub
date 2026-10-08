import {
  ChangeMessageVisibilityCommand,
  GetQueueAttributesCommand,
  SendMessageBatchCommand,
  SendMessageBatchRequestEntry,
} from '@aws-sdk/client-sqs';
import {
  PACKUMENT_INITIAL_DELAY_SECONDS,
  PACKUMENT_RETRY_BACKOFF_SECONDS,
} from './constants.lambda-shared';
import type { PackumentRequest } from './packument-processing.lambda-shared';
import { SQS_CLIENT } from '../../backend/shared/aws.lambda-shared';

/** The maximum number of messages in a single `SendMessageBatch` request. */
const SEND_BATCH_SIZE = 10;

/** How often the failed entries of a batch send are retried. */
const MAX_SEND_ATTEMPTS = 3;

/**
 * Sends packument requests to the packument queue. The first attempt happens
 * after `PACKUMENT_INITIAL_DELAY_SECONDS`.
 *
 * @throws if any request could not be sent.
 */
export async function enqueuePackumentRequests(
  queueUrl: string,
  requests: readonly PackumentRequest[]
): Promise<void> {
  const batches = new Array<PackumentRequest[]>();
  for (let i = 0; i < requests.length; i += SEND_BATCH_SIZE) {
    batches.push(requests.slice(i, i + SEND_BATCH_SIZE));
  }
  await Promise.all(batches.map((batch) => sendBatch(queueUrl, batch)));
}

async function sendBatch(
  queueUrl: string,
  batch: readonly PackumentRequest[]
): Promise<void> {
  let entries: SendMessageBatchRequestEntry[] = batch.map((request, i) => ({
    Id: i.toString(),
    MessageBody: JSON.stringify(request),
    DelaySeconds: PACKUMENT_INITIAL_DELAY_SECONDS,
  }));
  for (let attempt = 1; ; attempt++) {
    const response = await SQS_CLIENT.send(
      new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: entries })
    );
    const failed = new Set((response.Failed ?? []).map((f) => f.Id));
    if (failed.size === 0) {
      return;
    }
    if (attempt >= MAX_SEND_ATTEMPTS) {
      const reasons = (response.Failed ?? [])
        .map((f) => `${f.Code}: ${f.Message}`)
        .join('; ');
      throw new Error(
        `Could not send ${failed.size} packument request(s) to ${queueUrl}: ${reasons}`
      );
    }
    entries = entries.filter((entry) => failed.has(entry.Id));
  }
}

/**
 * Parses the body of a packument queue message.
 *
 * @throws if the body is not a packument request.
 */
export function parsePackumentRequest(body: string): PackumentRequest {
  const request = JSON.parse(body) as Partial<PackumentRequest>;
  if (
    typeof request.name !== 'string' ||
    typeof request.expectedRev !== 'number' ||
    typeof request.firstSeen !== 'number' ||
    (request.reason != null &&
      request.reason !== 'laggy' &&
      request.reason !== 'missing')
  ) {
    throw new Error(`Not a packument request: ${body}`);
  }
  return request as PackumentRequest;
}

/**
 * How long to wait before the next attempt, after the given attempt
 * (1-based) did not succeed.
 */
export function retryDelaySeconds(attempt: number): number {
  const index = Math.min(
    Math.max(attempt, 1) - 1,
    PACKUMENT_RETRY_BACKOFF_SECONDS.length - 1
  );
  return PACKUMENT_RETRY_BACKOFF_SECONDS[index];
}

/**
 * Makes a message the queue already delivered visible again after the given
 * number of seconds, instead of the queue's visibility timeout.
 */
export async function setVisibilityTimeout(
  queueUrl: string,
  receiptHandle: string,
  seconds: number
): Promise<void> {
  await SQS_CLIENT.send(
    new ChangeMessageVisibilityCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: seconds,
    })
  );
}

/**
 * The approximate number of requests in the packument queue: waiting, being
 * processed, and waiting for their next attempt.
 */
export async function queuedPackumentRequests(
  queueUrl: string
): Promise<number> {
  const { Attributes: attributes = {} } = await SQS_CLIENT.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: [
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
        'ApproximateNumberOfMessagesDelayed',
      ],
    })
  );
  return (
    Number(attributes.ApproximateNumberOfMessages ?? 0) +
    Number(attributes.ApproximateNumberOfMessagesNotVisible ?? 0) +
    Number(attributes.ApproximateNumberOfMessagesDelayed ?? 0)
  );
}
