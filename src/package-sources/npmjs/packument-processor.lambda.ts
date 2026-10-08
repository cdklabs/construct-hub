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
  ENV_PACKUMENT_QUEUE_URL,
  METRICS_NAMESPACE,
  MetricName,
  NPM_REPLICA_REGISTRY_URL,
  PACKUMENT_MAX_ATTEMPTS,
} from './constants.lambda-shared';
import { CouchChanges } from './couch-changes.lambda-shared';
import { KnownVersions } from './known-versions.lambda-shared';
import {
  checkPackument,
  PackumentCheckResult,
  PackumentProcessingContext,
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
 * the announced revision. Otherwise it is retried with back-off, for about 27
 * hours, and then moves to the dead-letter queue.
 *
 * Every message that is not done gets its next attempt scheduled, even when
 * the whole batch fails. Otherwise a broken processor would use up all
 * attempts within a few hours.
 */
export async function handler(
  event: SQSEvent,
  _context: Context
): Promise<SQSBatchResponse> {
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
    console.error(`Could not set up processing, retrying the batch: ${error}`);
    await Promise.all(
      event.Records.map((record) => scheduleNextAttempt(record, queueUrl))
    );
    throw error;
  }
  const npm = new CouchChanges(NPM_REPLICA_REGISTRY_URL, 'registry/_changes');

  let outcomes = new Array<RecordOutcome>();
  await metricScope((metrics) => async () => {
    metrics.setDimensions({});
    outcomes = await Promise.all(
      event.Records.map((record) =>
        processRecord(record, npm, metrics, processing)
      )
    );
    const count = (result: RecordResult, reason: PackumentRequestReason) =>
      outcomes.filter((o) => o.result === result && o.reason === reason).length;
    metrics.putMetric(
      MetricName.LAGGY_PACKUMENTS_RECOVERED,
      count('caught-up', 'laggy'),
      Unit.Count
    );
    metrics.putMetric(
      MetricName.LAGGY_PACKUMENT_GIVE_UPS,
      count('given-up', 'laggy'),
      Unit.Count
    );
    metrics.putMetric(
      MetricName.MISSING_PACKUMENTS_RECOVERED,
      count('caught-up', 'missing'),
      Unit.Count
    );
    metrics.putMetric(
      MetricName.MISSING_PACKUMENT_GIVE_UPS,
      count('given-up', 'missing'),
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
    // so they get recorded, unless that was their last attempt.
    console.error(`Could not record the known versions: ${error}`);
    for (const [i, outcome] of outcomes.entries()) {
      if (
        outcome.result === 'caught-up' &&
        attemptOf(event.Records[i]) < PACKUMENT_MAX_ATTEMPTS
      ) {
        outcome.done = false;
      }
    }
  }

  const failures = new Array<string>();
  await Promise.all(
    event.Records.map(async (record, i) => {
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

type RecordResult = PackumentCheckResult | 'given-up' | 'error';

interface RecordOutcome {
  readonly result: RecordResult;
  readonly reason?: PackumentRequestReason;
  /** For a laggy packument that caught up or was given up on: since when. */
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
  const attempt = attemptOf(record);
  let result: RecordResult;
  let reason: PackumentRequestReason | undefined;
  let name = record.messageId;
  let problem: string;
  let firstSeen: number | undefined;
  try {
    const request = parsePackumentRequest(record.body);
    name = request.name;
    reason = request.reason ?? 'laggy';
    firstSeen = request.firstSeen;
    result = await checkPackument(npm, request, metrics, processing);
    if (result === 'caught-up') {
      console.log(
        `Packument for ${name} caught up with rev ${request.expectedRev} (attempt ${attempt}, ${reason})`
      );
      return { result, reason, lag: lagOf(reason, firstSeen), done: true };
    }
    problem =
      result === 'missing'
        ? 'never served a packument for it'
        : `never served rev ${request.expectedRev}`;
  } catch (error) {
    console.error(
      `Failed to process the packument request for ${name}: ${error}`
    );
    result = 'error';
    problem = `could not be checked (${error})`;
  }

  if (attempt < PACKUMENT_MAX_ATTEMPTS) {
    return { result, reason, done: false };
  }
  const since =
    firstSeen != null
      ? ` (first seen ${new Date(firstSeen).toISOString()})`
      : '';
  console.warn(
    `Giving up on ${
      reason ?? 'unknown'
    } packument for ${name}: the registry ${problem}${since}. A version announced by the changes feed may be missing until the package publishes again.`
  );
  // Unparseable requests also go to the dead-letter queue, but are not
  // counted as given up.
  return {
    result: reason == null ? result : 'given-up',
    reason,
    lag: lagOf(reason, firstSeen),
    done: false,
  };
}

/** How long a laggy packument has been waiting. */
function lagOf(
  reason: PackumentRequestReason | undefined,
  firstSeen: number | undefined
): number | undefined {
  return reason === 'laggy' && firstSeen != null
    ? Date.now() - firstSeen
    : undefined;
}

/**
 * Makes a message visible again for its next attempt. After the last attempt
 * that is right away, so it moves to the dead-letter queue.
 */
async function scheduleNextAttempt(
  record: SQSRecord,
  queueUrl: string
): Promise<void> {
  const attempt = attemptOf(record);
  const delay =
    attempt >= PACKUMENT_MAX_ATTEMPTS ? 0 : retryDelaySeconds(attempt);
  try {
    await setVisibilityTimeout(queueUrl, record.receiptHandle, delay);
  } catch (error) {
    // The message returns after the queue's visibility timeout instead.
    console.error(
      `Could not schedule the next attempt for ${record.messageId}: ${error}`
    );
  }
}

function attemptOf(record: SQSRecord): number {
  return Number(record.attributes.ApproximateReceiveCount);
}
