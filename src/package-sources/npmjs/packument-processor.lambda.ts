import {
  metricScope,
  Configuration,
  MetricsLogger,
  Unit,
} from 'aws-embedded-metrics';
import type {
  Context,
  SQSBatchResponse,
  SQSEvent,
  SQSRecord,
} from 'aws-lambda';
import { captureHTTPsGlobal } from 'aws-xray-sdk-core';
import {
  ENV_KNOWN_VERSIONS_TABLE_NAME,
  ENV_PACKUMENT_DEAD_LETTER_QUEUE_ARN,
  ENV_PACKUMENT_QUEUE_URL,
  METRICS_NAMESPACE,
  MetricName,
  NPM_REPLICA_REGISTRY_URL,
} from './constants.lambda-shared';
import { CouchChanges } from './couch-changes.lambda-shared';
import { KnownVersions } from './known-versions.lambda-shared';
import {
  checkPackument,
  PackumentProcessingContext,
  PackumentRequest,
  PackumentRequestReason,
} from './packument-processing.lambda-shared';
import {
  parsePackumentRequest,
  retryDelaySeconds,
  setVisibilityTimeout,
} from './packument-queue.lambda-shared';
import { DenyListClient } from '../../backend/deny-list/client.lambda-shared';
import { LicenseListClient } from '../../backend/license-list/client.lambda-shared';
import { requireEnv } from '../../backend/shared/env.lambda-shared';

Configuration.namespace = METRICS_NAMESPACE;

// eslint-disable-next-line @typescript-eslint/no-require-imports
captureHTTPsGlobal(require('https'));

/**
 * Processes packument requests: fetches each package from the registry and
 * processes the versions it serves. A request is done once the registry serves
 * the announced revision. Otherwise it is checked again later, with growing
 * waits. After about 29 hours the queue moves it to the dead-letter queue.
 *
 * This function also reads the dead-letter queue. A request that arrives from
 * there was given up on: it is logged, counted, and deleted.
 */
export async function handler(
  event: SQSEvent,
  _context: Context
): Promise<SQSBatchResponse> {
  const deadLetterQueueArn = requireEnv(ENV_PACKUMENT_DEAD_LETTER_QUEUE_ARN);
  const givenUp = event.Records.filter(
    (record) => record.eventSourceARN === deadLetterQueueArn
  );
  const pending = event.Records.filter(
    (record) => record.eventSourceARN !== deadLetterQueueArn
  );
  if (givenUp.length > 0) {
    await reportGiveUps(givenUp);
  }
  if (pending.length === 0) {
    return { batchItemFailures: [] };
  }

  const queueUrl = requireEnv(ENV_PACKUMENT_QUEUE_URL);
  let processing: PackumentProcessingContext;
  try {
    processing = {
      stagingFunction: requireEnv('FUNCTION_NAME'),
      denyList: await DenyListClient.newClient(),
      licenseList: await LicenseListClient.newClient(),
      knownVersions: new KnownVersions(
        requireEnv(ENV_KNOWN_VERSIONS_TABLE_NAME)
      ),
    };
  } catch (error) {
    // Keep the usual waits; otherwise a broken processor would use up all
    // attempts at the queue's visibility timeout.
    console.error(`Could not set up processing, retrying the batch: ${error}`);
    await Promise.all(
      pending.map((record) => scheduleNextAttempt(record, queueUrl))
    );
    throw error;
  }
  const npm = new CouchChanges(NPM_REPLICA_REGISTRY_URL, 'registry/_changes');

  let outcomes = new Array<RecordOutcome>();
  await metricScope((metrics) => async () => {
    metrics.setDimensions({});
    outcomes = await Promise.all(
      pending.map((record) => processRecord(record, npm, metrics, processing))
    );
    const recovered = (reason: PackumentRequestReason) =>
      outcomes.filter((o) => o.done && o.reason === reason).length;
    metrics.putMetric(
      MetricName.LAGGY_PACKUMENTS_RECOVERED,
      recovered('laggy'),
      Unit.Count
    );
    metrics.putMetric(
      MetricName.MISSING_PACKUMENTS_RECOVERED,
      recovered('missing'),
      Unit.Count
    );
    for (const { lag } of outcomes) {
      if (lag != null) {
        metrics.putMetric(
          MetricName.LAGGY_PACKUMENT_LAG,
          lag,
          Unit.Milliseconds
        );
      }
    }
  })();

  try {
    await processing.knownVersions.flush();
  } catch (error) {
    // The versions were staged but not recorded. Check these packages again
    // so they get recorded.
    console.error(`Could not record the known versions: ${error}`);
    for (const outcome of outcomes) {
      outcome.done = false;
    }
  }

  const failures = new Array<string>();
  await Promise.all(
    pending.map(async (record, i) => {
      if (!outcomes[i].done) {
        failures.push(record.messageId);
        await scheduleNextAttempt(record, queueUrl);
      }
    })
  );
  return {
    batchItemFailures: failures.map((itemIdentifier) => ({ itemIdentifier })),
  };
}

interface RecordOutcome {
  readonly reason?: PackumentRequestReason;
  /** For a laggy packument that caught up: how long it took. */
  readonly lag?: number;
  /** Whether the message can be deleted from the queue. */
  done: boolean;
}

/**
 * Processes one queue message.
 */
async function processRecord(
  record: SQSRecord,
  npm: CouchChanges,
  metrics: MetricsLogger,
  processing: PackumentProcessingContext
): Promise<RecordOutcome> {
  let name = record.messageId;
  let reason: PackumentRequestReason | undefined;
  try {
    const request = parsePackumentRequest(record.body);
    name = request.name;
    reason = request.reason ?? 'laggy';
    const result = await checkPackument(npm, request, metrics, processing);
    if (result !== 'caught-up') {
      return { reason, done: false };
    }
    console.log(
      `Packument for ${name} caught up with rev ${request.expectedRev} (${reason})`
    );
    return { reason, lag: lagOf(request), done: true };
  } catch (error) {
    console.error(
      `Failed to process the packument request for ${name}: ${error}`
    );
    return { reason, done: false };
  }
}

/**
 * Logs and counts requests that were given up on. They are deleted from the
 * dead-letter queue afterwards: nothing would redrive them.
 */
async function reportGiveUps(records: readonly SQSRecord[]): Promise<void> {
  await metricScope((metrics) => async () => {
    metrics.setDimensions({});
    const counts: Record<PackumentRequestReason, number> = {
      laggy: 0,
      missing: 0,
    };
    for (const record of records) {
      let request: PackumentRequest;
      try {
        request = parsePackumentRequest(record.body);
      } catch {
        console.warn(
          `Giving up on an invalid packument request: ${record.body}`
        );
        continue;
      }
      const reason = request.reason ?? 'laggy';
      counts[reason] += 1;
      const problem =
        reason === 'missing'
          ? 'never served a packument for it'
          : `never served rev ${request.expectedRev}`;
      console.warn(
        `Giving up on ${reason} packument for ${
          request.name
        }: the registry ${problem} (first seen ${new Date(
          request.firstSeen
        ).toISOString()}). A version announced by the changes feed may be missing until the package publishes again.`
      );
      const lag = lagOf(request);
      if (lag != null) {
        metrics.putMetric(
          MetricName.LAGGY_PACKUMENT_LAG,
          lag,
          Unit.Milliseconds
        );
      }
    }
    metrics.putMetric(
      MetricName.LAGGY_PACKUMENT_GIVE_UPS,
      counts.laggy,
      Unit.Count
    );
    metrics.putMetric(
      MetricName.MISSING_PACKUMENT_GIVE_UPS,
      counts.missing,
      Unit.Count
    );
  })();
}

/** How long a request has been waiting. */
function lagOf(request: PackumentRequest): number | undefined {
  return (request.reason ?? 'laggy') === 'laggy'
    ? Date.now() - request.firstSeen
    : undefined;
}

/**
 * Makes a message visible again for its next attempt.
 */
async function scheduleNextAttempt(
  record: SQSRecord,
  queueUrl: string
): Promise<void> {
  let firstSeen: number | undefined;
  try {
    firstSeen = parsePackumentRequest(record.body).firstSeen;
  } catch {
    // An invalid request gets the shortest wait, and ends up given up on.
  }
  try {
    await setVisibilityTimeout(
      queueUrl,
      record.receiptHandle,
      retryDelaySeconds(firstSeen)
    );
  } catch (error) {
    // The message returns after the queue's visibility timeout instead.
    console.error(
      `Could not schedule the next attempt for ${record.messageId}: ${error}`
    );
  }
}
