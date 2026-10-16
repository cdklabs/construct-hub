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
  PACKUMENT_MAX_AGE_MS,
  PackumentGiveUpReason,
} from './constants.lambda-shared';
import { CouchChanges } from './couch-changes.lambda-shared';
import { KnownVersions } from './known-versions.lambda-shared';
import {
  checkPackument,
  PackumentProcessingContext,
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
 * processes the versions it serves.
 *
 * A request is done once the registry serves the revision the changes feed
 * announced. Until then it is checked again with growing waits. Once a request
 * is older than a day, its last check decides: if the registry has still not
 * caught up, the request is given up on and deleted.
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
    // Keep the usual waits; otherwise a broken processor would use up all
    // attempts at the queue's visibility timeout.
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
    const start = Date.now();
    outcomes = await Promise.all(
      event.Records.map((record) =>
        processRecord(record, npm, metrics, processing)
      )
    );
    metrics.putMetric(
      MetricName.METADATA_FETCH_FAILURES,
      outcomes.filter((o) => o.result === 'unreachable').length,
      Unit.Count
    );
    metrics.putMetric(
      MetricName.FAILED_PACKUMENT_RETRIEVALS,
      outcomes.filter((o) => FAILED_RESULTS.has(o.result)).length,
      Unit.Count
    );
    for (const { delay, modified } of outcomes) {
      if (delay != null) {
        metrics.putMetric(MetricName.PACKUMENT_DELAY, delay, Unit.Seconds);
      }
      if (modified != null) {
        metrics.putMetric(
          MetricName.NPMJS_CHANGE_AGE,
          start - modified.getTime(),
          Unit.Milliseconds
        );
      }
    }
  })();
  await reportGiveUps(outcomes);

  try {
    await processing.knownVersions.flush();
  } catch (error) {
    // The versions were staged but not recorded. Check these packages again,
    // even ones given up on, so they get recorded.
    console.error(`Could not record the known versions: ${error}`);
    for (const outcome of outcomes) {
      outcome.done = false;
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

interface RecordOutcome {
  /**
   * What the check found: `unreachable` if the fetch failed, `invalid` if the
   * message is not a packument request.
   */
  readonly result: 'caught-up' | FailedResult | 'invalid';
  /** Why the request was given up on, if it was. */
  readonly givenUp?: PackumentGiveUpReason;
  /**
   * For a request that caught up after earlier checks failed: how long it
   * took, in seconds.
   */
  readonly delay?: number;
  /** When the processed packument was last modified. */
  readonly modified?: Date;
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
  let request;
  try {
    request = parsePackumentRequest(record.body);
  } catch (error) {
    // Retried until the queue moves it to the dead-letter queue.
    console.error(`Invalid packument request ${record.messageId}: ${error}`);
    return { result: 'invalid', done: false };
  }

  let result: 'caught-up' | FailedResult;
  let servedRev: number | undefined;
  let modified: Date | undefined;
  try {
    ({ result, servedRev, modified } = await checkPackument(
      npm,
      request,
      metrics,
      processing
    ));
  } catch (error) {
    console.error(`Could not fetch the packument for ${request.name}: ${error}`);
    result = 'unreachable';
  }

  const age = Date.now() - request.firstSeen;
  if (result === 'caught-up') {
    const retried = Number(record.attributes.ApproximateReceiveCount) > 1;
    if (retried) {
      console.log(
        `Packument for ${request.name} caught up with rev ${request.expectedRev}`
      );
    }
    return {
      result,
      delay: retried ? Math.round(age / 1_000) : undefined,
      modified,
      done: true,
    };
  }

  const problem =
    result === 'unreachable'
      ? 'could not be reached for it'
      : result === 'missing'
        ? 'has no packument for it'
        : `serves rev ${servedRev}, not rev ${request.expectedRev}`;
  if (age < PACKUMENT_MAX_AGE_MS) {
    console.log(`${request.name}: the registry ${problem}, checking again later`);
    return { result, modified, done: false };
  }
  console.warn(
    `Giving up on ${request.name}: the registry still ${problem} (first seen ${new Date(
      request.firstSeen
    ).toISOString()}). A version announced by the changes feed may be missing until the package publishes again.`
  );
  return { result, givenUp: GIVE_UP_REASONS[result], modified, done: true };
}

type FailedResult = 'laggy' | 'missing' | 'unreachable';

const FAILED_RESULTS: ReadonlySet<RecordOutcome['result']> = new Set([
  'laggy',
  'missing',
  'unreachable',
]);

const GIVE_UP_REASONS: Record<FailedResult, PackumentGiveUpReason> = {
  laggy: PackumentGiveUpReason.LAGGY,
  missing: PackumentGiveUpReason.MISSING,
  unreachable: PackumentGiveUpReason.UNREACHABLE,
};

/**
 * Counts the requests given up on, by reason and in total.
 */
async function reportGiveUps(outcomes: readonly RecordOutcome[]): Promise<void> {
  for (const reason of Object.values(GIVE_UP_REASONS)) {
    const count = outcomes.filter((o) => o.givenUp === reason).length;
    if (count === 0) {
      continue;
    }
    await metricScope((metrics) => async () => {
      // Also without the dimension, for the total.
      metrics.setDimensions([{ Reason: reason }, {}]);
      metrics.putMetric(MetricName.PACKUMENT_GIVE_UPS, count, Unit.Count);
    })();
  }
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
    // An invalid request gets the shortest wait, and ends up in the
    // dead-letter queue.
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
