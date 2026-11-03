import {
  ChangeMessageVisibilityCommand,
  SendMessageBatchCommand,
  SendMessageBatchRequestEntry,
} from '@aws-sdk/client-sqs';
import { Sema } from 'async-sema';
import {
  PACKUMENT_MAX_RETRY_DELAY_SECONDS,
  PACKUMENT_MIN_RETRY_DELAY_SECONDS,
  PACKUMENT_RETRY_JITTER,
} from './constants.lambda-shared';
import type { PackumentRequest } from './packument-processing.lambda-shared';
import { SQS_CLIENT } from '../../backend/shared/aws.lambda-shared';

/** The maximum number of messages in a single `SendMessageBatch` request. */
const SEND_BATCH_SIZE = 10;

/** How often the failed entries of a batch send are retried. */
const MAX_SEND_ATTEMPTS = 3;

/** The maximum number of concurrent `SendMessageBatch` requests. */
const MAX_CONCURRENT_SENDS = 25;

/** SQS delays a new message by at most 15 minutes. */
const MAX_SQS_DELAY_SECONDS = 15 * 60;

const SEND_SEMAPHORE = new Sema(MAX_CONCURRENT_SENDS);

/**
 * Sends packument requests to the packument queue.
 *
 * @param delaySeconds how long the requests wait before their first attempt
 *        (at most 15 minutes).
 * @throws if any request could not be sent.
 */
export async function enqueuePackumentRequests(
  queueUrl: string,
  requests: readonly PackumentRequest[],
  delaySeconds: number = 0
): Promise<void> {
  const batches = new Array<PackumentRequest[]>();
  for (let i = 0; i < requests.length; i += SEND_BATCH_SIZE) {
    batches.push(requests.slice(i, i + SEND_BATCH_SIZE));
  }
  const delay = Math.min(Math.round(delaySeconds), MAX_SQS_DELAY_SECONDS);
  await Promise.all(
    batches.map(async (batch) => {
      await SEND_SEMAPHORE.acquire();
      try {
        await sendBatch(queueUrl, batch, delay);
      } finally {
        SEND_SEMAPHORE.release();
      }
    })
  );
}

async function sendBatch(
  queueUrl: string,
  batch: readonly PackumentRequest[],
  delaySeconds: number
): Promise<void> {
  let entries: SendMessageBatchRequestEntry[] = batch.map((request, i) => ({
    Id: i.toString(),
    MessageBody: JSON.stringify(request),
    DelaySeconds: delaySeconds,
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
 * Parses the body of a packument queue message. Messages sent by earlier
 * versions may have a `reason`, which is ignored.
 *
 * @throws if the body is not a packument request.
 */
export function parsePackumentRequest(body: string): PackumentRequest {
  const request = JSON.parse(body) as Partial<PackumentRequest>;
  if (
    typeof request.name !== 'string' ||
    typeof request.expectedRev !== 'number' ||
    typeof request.firstSeen !== 'number'
  ) {
    throw new Error(`Not a packument request: ${body}`);
  }
  return request as PackumentRequest;
}

/**
 * How long to wait before the next attempt. A request waits as long as it is
 * already old, within the minimum and maximum delay, plus or minus some jitter.
 * This doubles the wait with each attempt, without counting attempts.
 *
 * @param firstSeen when the request was made (epoch milliseconds), if known.
 */
export function retryDelaySeconds(
  firstSeen: number | undefined,
  now: number = Date.now(),
  random: () => number = Math.random
): number {
  const ageSeconds = firstSeen == null ? 0 : (now - firstSeen) / 1_000;
  const delay = Math.min(
    Math.max(ageSeconds, PACKUMENT_MIN_RETRY_DELAY_SECONDS),
    PACKUMENT_MAX_RETRY_DELAY_SECONDS
  );
  const jitter = 1 + PACKUMENT_RETRY_JITTER * (2 * random() - 1);
  return Math.round(delay * jitter);
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
