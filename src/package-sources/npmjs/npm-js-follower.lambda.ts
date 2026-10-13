import * as console from 'console';
import {
  metricScope,
  Configuration,
  MetricsLogger,
  Unit,
} from 'aws-embedded-metrics';
import type { Context, ScheduledEvent } from 'aws-lambda';
import { captureHTTPsGlobal } from 'aws-xray-sdk-core';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import {
  MetricName,
  MARKER_FILE_NAME,
  METRICS_NAMESPACE,
  FOLLOWER_STATE_FILE_NAME,
  SCAN_WINDOW_MS,
  STATE_RETENTION_MS,
  ENV_PACKUMENT_QUEUE_URL,
  NPM_REPLICA_REGISTRY_URL,
} from './constants.lambda-shared';
import {
  CouchChanges,
  DatabaseChanges,
  getMaxSequentialRevision,
} from './couch-changes.lambda-shared';
import { FollowerState } from './follower-state.lambda-shared';
import { PackumentRequest } from './packument-processing.lambda-shared';
import { enqueuePackumentRequests } from './packument-queue.lambda-shared';
import {
  loadContentFromS3,
  MarkerFileSchema,
  putObject,
} from './staging-bucket.lambda-shared';
import { compressContent } from '../../backend/shared/compress-content.lambda-shared';
import { requireEnv } from '../../backend/shared/env.lambda-shared';

/**
 * The page size used when scanning the `_changes` feed. Receipts discard
 * already-received entries before any packument is fetched, so scans can
 * afford the feed's maximum page size (10,000).
 */
const SCAN_BATCH_SIZE = 10_000;

/**
 * A scan batch is only started when at least this much time remains in the
 * Lambda execution. An interrupted scan simply resumes on the next run: the
 * receipts make re-reads cheap, and no checkpoint is recorded for an
 * incomplete scan.
 */
const SCAN_TIME_BUDGET_MS = 60_000;

// Configure embedded metrics format
Configuration.namespace = METRICS_NAMESPACE;

// Make sure X-Ray traces will include HTTP(s) calls.
// eslint-disable-next-line @typescript-eslint/no-require-imports
captureHTTPsGlobal(require('https'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
captureHTTPsGlobal(require('http'));

/**
 * This function triggers on a fixed schedule and scans the npmjs CouchDB
 * `_changes` feed for new package versions.
 *
 * The feed gives no guarantee that change entries become visible in sequence
 * order (entries occasionally appear *behind* previously returned positions),
 * so the follower does not track a single high-water mark. Instead it keeps a
 * receipt for every change entry it has received, and every run re-reads a
 * trailing window of the feed, processing any entry it has no receipt for:
 *
 * 1. Rolling checkpoints map times to feed positions a completed scan has
 *    fully covered. The scan floor is the checkpointed position from
 *    `SCAN_WINDOW_MS` ago (a periodic deep scan covers the full retention
 *    window instead).
 * 2. Each scan reads the window ascending from the floor. Receipts make
 *    re-reads of already-covered ranges nearly free.
 * 3. Each new entry is sent to the packument queue, where the packument
 *    processor fetches the package from the registry and processes it. The
 *    follower itself never fetches packuments.
 *
 * npm registry API docs: https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md
 *
 * @param context a Lambda execution context
 */
export async function handler(event: ScheduledEvent, context: Context) {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  const stagingBucket = requireEnv('BUCKET_NAME');
  const queueUrl = requireEnv(ENV_PACKUMENT_QUEUE_URL);

  const npm = new CouchChanges(NPM_REPLICA_REGISTRY_URL, 'registry/_changes');

  const head = Number((await npm.info()).update_seq);

  const state = await loadFollowerState(stagingBucket, head);

  // The feed's sequence space can change (entries can disappear from the end,
  // moving the head backwards). Our position state is then meaningless.
  const newestCheckpoint = state.newestCheckpointSeq();
  if (newestCheckpoint != null && newestCheckpoint > head) {
    console.warn(
      `Feed head (${head}) is below our newest checkpoint (${newestCheckpoint}); the sequence space changed. Resetting position state.`
    );
    state.resetPosition();
    state.addCheckpoint(head);
  }

  try {
    // Scan the trailing window of the feed. Progress is persisted after
    // every processed chunk (see PersistState), so even a run that is hard
    // killed by the Lambda timeout keeps its completed work.
    const persist: PersistState = () =>
      saveFollowerState(context, stagingBucket, state);
    await runScan(context, npm, state, head, queueUrl, persist);
  } finally {
    // Persist the state even when a scan failed part-way: receipts and
    // interim checkpoints are completed work the next run should not redo.
    await saveFollowerState(context, stagingBucket, state);
  }

  console.log('All done here, we have success!');

  return { head };
}

//#region Scan
/**
 * A callback persisting the follower state to S3. Called after every processed chunk, so that progress is
 * durable even when the Lambda times out mid-scan: a timeout is a hard kill,
 * and anything not persisted would be redone by the next run. Without this, a
 * backlog too large for a single execution would never complete (every run
 * would restart it from scratch).
 */
type PersistState = () => Promise<void>;

/**
 * Re-reads the trailing window of the feed and processes every change entry
 * for which no receipt exists. A checkpoint is only recorded when the scan
 * covered the entire window; an interrupted scan resumes naturally on the
 * next run (receipts make the re-read cheap).
 *
 * @returns the number of package versions sent for staging.
 */
async function runScan(
  context: Context,
  npm: CouchChanges,
  state: FollowerState,
  head: number,
  queueUrl: string,
  persist: PersistState
): Promise<void> {
  const now = Date.now();
  const deep = state.deepScanDue(now);
  const windowMs = deep ? STATE_RETENTION_MS : SCAN_WINDOW_MS;
  const floor = state.floorSeq(windowMs, now);
  if (floor == null) {
    // Cannot happen after seeding, but guards the type.
    console.warn('No checkpoint history; skipping scan');
    return;
  }
  // Entries discovered at or below this position were inserted into the feed
  // behind a position we had already read past.
  const lateBoundary = state.newestCheckpointSeq() ?? floor;

  console.log(
    `Starting ${
      deep ? 'deep ' : ''
    }scan of (${floor}, ${head}] (late boundary: ${lateBoundary})`
  );

  let completed = false;
  let maxSeqSeen = head;

  // Read the window ascending from the floor. Receipts make re-reads of
  // already-covered ranges nearly free (no packuments are fetched for them).
  let cursor = floor;
  let outOfBudget = false;
  while (
    !completed &&
    !outOfBudget &&
    context.getRemainingTimeInMillis() > SCAN_TIME_BUDGET_MS
  ) {
    await metricScope((metrics) => async () => {
      metrics.setDimensions({});
      metrics.setProperty('StartSeq', cursor);
      const batch = await npm.changes(cursor, { batchSize: SCAN_BATCH_SIZE });
      const next = Number(batch.last_seq);
      metrics.setProperty('EndSeq', next);
      if (batch.seqs.length > 0) {
        maxSeqSeen = Math.max(maxSeqSeen, ...batch.seqs);
      }
      const outcome = await processBatch(
        batch,
        metrics,
        context,
        state,
        lateBoundary,
        head,
        queueUrl,
        persist
      );
      if (!outcome.fullyProcessed) {
        // The batch was only partially processed (time budget): the
        // unprocessed entries carry no receipt, so the next run picks them
        // up. No checkpoint may be recorded past them.
        outOfBudget = true;
      } else if (batch.totalCount < SCAN_BATCH_SIZE || next <= cursor) {
        // A short page means we are caught up with the feed head.
        completed = true;
      } else {
        cursor = next;
        // Coverage from the floor up to `next` is contiguous, so this is a
        // valid checkpoint. Recording it makes an interrupted scan (most
        // importantly: a backfill) resume from here instead of the floor.
        if (next > (state.newestCheckpointSeq() ?? 0)) {
          state.addCheckpoint(next);
          await persist();
        }
      }
    })();
  }

  if (completed) {
    // The scan covered the entire window: everything the feed served up to
    // `maxSeqSeen` now has a receipt.
    state.addCheckpoint(maxSeqSeen);
    if (deep) {
      state.completeDeepScan();
      console.log(`Completed deep scan at seq ${maxSeqSeen}`);
    }
  } else {
    console.log(
      'Scan ran out of time; it will resume on the next run (no checkpoint recorded)'
    );
  }
}

/**
 * The maximum number of change entries per chunk. The follower persists its
 * state after every chunk, and re-checks its time budget in between.
 */
const CHUNK_SIZE = 1_000;

/**
 * Processes one page of change entries: discards everything we already have a
 * receipt for, then works through the remainder in chunks. Each chunk is sent
 * to the packument queue, receipted, and persisted, so completed chunks
 * survive a timeout. Processing stops between chunks when the time budget is
 * exhausted; unprocessed entries carry no receipt and are picked up by the
 * next run.
 *
 * @returns whether all entries of the page were processed.
 */
async function processBatch(
  batch: DatabaseChanges,
  metrics: MetricsLogger,
  context: Context,
  state: FollowerState,
  lateBoundary: number,
  head: number,
  queueUrl: string,
  persist: PersistState
): Promise<{ fullyProcessed: boolean }> {
  const startTime = Date.now();
  let fullyProcessed = true;
  try {
    // Entries for deleted packages are ignored, as if they were not in the
    // feed: there is nothing to process, and no receipt is recorded.
    const fresh = batch.results.filter(
      (change) =>
        !change.deleted &&
        change.id &&
        change.seq != null &&
        !state.has(Number(change.seq))
    );
    console.log(
      `Received ${batch.totalCount} change entr(ies), ${fresh.length} without a receipt`
    );
    metrics.putMetric(MetricName.CHANGE_COUNT, fresh.length, Unit.Count);

    for (let offset = 0; offset < fresh.length; offset += CHUNK_SIZE) {
      if (
        offset > 0 &&
        context.getRemainingTimeInMillis() < SCAN_TIME_BUDGET_MS
      ) {
        console.log(
          `Time budget exhausted after ${offset} of ${fresh.length} entries; the rest carries no receipt and is picked up by the next run`
        );
        fullyProcessed = false;
        break;
      }
      const chunk = fresh.slice(offset, offset + CHUNK_SIZE);

      // Entries below the late boundary were inserted into the feed behind a
      // position a completed scan had already read past.
      const late = chunk.filter((change) => Number(change.seq) <= lateBoundary);
      metrics.putMetric(MetricName.LATE_CHANGE_COUNT, late.length, Unit.Count);
      for (const change of late) {
        const crossedAt = state.timeCrossed(Number(change.seq));
        if (crossedAt != null) {
          metrics.putMetric(
            MetricName.LATE_CHANGE_LAG,
            Date.now() - crossedAt,
            Unit.Milliseconds
          );
        }
        console.log(
          `[late] Change entry discovered at seq ${change.seq} (behind ${lateBoundary}): ${change.id}`
        );
      }

      // The packument processor fetches and processes each package. Receipts
      // are only recorded once the requests are sent, so a failure here makes
      // the next run send the chunk again.
      const now = Date.now();
      await enqueuePackumentRequests(
        queueUrl,
        chunk.map(
          (change): PackumentRequest => ({
            name: change.id,
            expectedRev: getMaxSequentialRevision(change),
            seq: Number(change.seq),
            firstSeen: now,
          })
        )
      );
      state.addSeqs(chunk.map((change) => Number(change.seq)));
      await persist();
    }
  } finally {
    metrics.putMetric(MetricName.LAST_SEQ, head, Unit.None);
    metrics.putMetric(
      MetricName.BATCH_PROCESSING_TIME,
      Date.now() - startTime,
      Unit.Milliseconds
    );
    metrics.putMetric(
      MetricName.REMAINING_TIME,
      context.getRemainingTimeInMillis(),
      Unit.Milliseconds
    );
  }
  return { fullyProcessed };
}
//#endregion

//#region State
/**
 * Loads the follower state from S3. When the state file does not exist (or
 * cannot be parsed), a fresh state is seeded: from the legacy transaction
 * marker if one exists (so existing deployments continue where the previous
 * follower left off), or from the current feed head otherwise.
 */
async function loadFollowerState(
  stagingBucket: string,
  head: number
): Promise<FollowerState> {
  const warningMessage = `Follower state object (s3://${stagingBucket}/${FOLLOWER_STATE_FILE_NAME}) does not exist, seeding a fresh state`;
  const content = await loadContentFromS3(
    stagingBucket,
    FOLLOWER_STATE_FILE_NAME,
    warningMessage
  );
  if (content != null) {
    try {
      const state = FollowerState.fromText(content);
      console.log(
        `Loaded follower state: ${state.receiptCount} receipt(s), ${state.checkpointCount} checkpoint(s)`
      );
      return state;
    } catch (error) {
      console.warn(`Could not parse follower state, seeding fresh: ${error}`);
    }
  }

  const state = new FollowerState();
  const seed = await loadLegacyMarker(stagingBucket);
  if (seed != null && seed <= head) {
    console.log(`Seeding follower state from legacy marker: ${seed}`);
    state.addCheckpoint(seed);
  } else {
    // Brand-new deployment: start at the beginning of the feed, so the
    // instance backfills the entire history automatically (interim
    // checkpoints make the backfill incremental across runs).
    console.log(
      'Seeding follower state at the beginning of the feed (automatic backfill)'
    );
    state.addCheckpoint(0);
  }
  return state;
}

/**
 * Reads the sequence number from the legacy transaction marker file, if
 * present. The previous follower implementation stored its position there.
 */
async function loadLegacyMarker(
  stagingBucket: string
): Promise<number | undefined> {
  const content = await loadContentFromS3(
    stagingBucket,
    MARKER_FILE_NAME,
    `No legacy marker object (s3://${stagingBucket}/${MARKER_FILE_NAME})`
  );
  if (content === null) {
    return undefined;
  }
  try {
    const parsed: MarkerFileSchema = JSON.parse(content);
    const marker = typeof parsed === 'number' ? parsed : Number(parsed.marker);
    return isNaN(marker) ? undefined : marker;
  } catch (error) {
    console.warn(`Could not parse legacy marker: ${error}`);
    return undefined;
  }
}

/**
 * Persists the follower state to S3 (gzip-compressed when large enough to
 * warrant it).
 */
async function saveFollowerState(
  context: Context,
  stagingBucket: string,
  state: FollowerState
) {
  const { buffer, contentEncoding } = compressContent(
    Buffer.from(state.toText(), 'utf-8')
  );
  console.log(
    `Updating follower state (${state.receiptCount} receipt(s), ${state.checkpointCount} checkpoint(s))`
  );
  await putObject(context, stagingBucket, FOLLOWER_STATE_FILE_NAME, buffer, {
    ContentType: 'text/plain',
    ContentEncoding: contentEncoding,
  });
  console.log('Successfully updated follower state');
}

//#endregion
