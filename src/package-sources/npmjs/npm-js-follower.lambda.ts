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
  ENV_KNOWN_VERSIONS_TABLE_NAME,
  FOLLOWER_STATE_FILE_NAME,
  SCAN_WINDOW_MS,
  STATE_RETENTION_MS,
  ENV_PACKUMENT_QUEUE_URL,
  NPM_REPLICA_REGISTRY_URL,
} from './constants.lambda-shared';
import {
  CouchChanges,
  DatabaseChange,
  DatabaseChanges,
} from './couch-changes.lambda-shared';
import { FollowerState } from './follower-state.lambda-shared';
import { KnownVersions } from './known-versions.lambda-shared';
import {
  PackumentProcessingContext,
  PackumentRequest,
  PackumentRequestReason,
  processPackuments,
} from './packument-processing.lambda-shared';
import {
  enqueuePackumentRequests,
  queuedPackumentRequests,
} from './packument-queue.lambda-shared';
import {
  loadContentFromS3,
  MarkerFileSchema,
  putObject,
} from './staging-bucket.lambda-shared';
import { DenyListClient } from '../../backend/deny-list/client.lambda-shared';
import { LicenseListClient } from '../../backend/license-list/client.lambda-shared';
import { compressContent } from '../../backend/shared/compress-content.lambda-shared';
import { requireEnv } from '../../backend/shared/env.lambda-shared';

/**
 * The release date of `aws-cdk@0.8.0`. Anything earlier than this basically is
 * not a relevant package, as it cannot possibly be a constructs-based package.
 * This is used to fast-forward over boring stuff when the follower state is
 * seeded far in the past.
 */
const DAWN_OF_CONSTRUCTS = new Date('2018-07-31T13:43:04.615Z');

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
 * 3. For each new entry, the packument is fetched from the registry and every
 *    version it contains is processed (deny list, license, and known-versions
 *    checks apply). If the packument is behind the revision announced by the
 *    feed (a "laggy packument"), the served versions are still processed, and
 *    a request to check the package again is sent to the packument queue,
 *    where it is retried until the announced revision appears or it is given
 *    up on.
 *
 * npm registry API docs: https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md
 *
 * @param context a Lambda execution context
 */
export async function handler(event: ScheduledEvent, context: Context) {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  const stagingBucket = requireEnv('BUCKET_NAME');
  const queueUrl = requireEnv(ENV_PACKUMENT_QUEUE_URL);
  const knownVersions = new KnownVersions(
    requireEnv(ENV_KNOWN_VERSIONS_TABLE_NAME)
  );
  const processing: PackumentProcessingContext = {
    stagingFunction: requireEnv('FUNCTION_NAME'),
    denyList: await DenyListClient.newClient(),
    licenseList: await LicenseListClient.newClient(),
    knownVersions,
  };

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
      persistProgress(context, stagingBucket, state, knownVersions);
    await runScan(context, npm, state, head, processing, queueUrl, persist);

    // Requests waiting in the packument queue, including those this run sent.
    const laggyPackuments = await queuedPackumentRequests(queueUrl);
    await metricScope((metrics) => async () => {
      metrics.setDimensions({});
      metrics.putMetric(
        MetricName.LAGGY_PACKUMENTS,
        laggyPackuments,
        Unit.Count
      );
    })();
  } finally {
    // Persist the state even when a scan failed part-way: receipts, interim
    // checkpoints, and staged known versions represent completed work that
    // the next run should not redo.
    await persistProgress(context, stagingBucket, state, knownVersions);
  }

  console.log('All done here, we have success!');

  return { head };
}

//#region Scan
/**
 * A callback persisting the follower state (and optionally the known
 * versions) to S3. Called after every processed chunk, so that progress is
 * durable even when the Lambda times out mid-scan: a timeout is a hard kill,
 * and anything not persisted would be redone by the next run. Without this, a
 * backlog too large for a single execution would never complete (every run
 * would restart it from scratch).
 */
type PersistState = () => Promise<void>;

/**
 * Persists the known versions recorded since the last call, then the follower
 * state. Known versions go first: if saving the state fails, the next run
 * redoes the work, and the known versions prevent it from staging the same
 * versions again. The reverse order could record receipts for entries whose
 * staged versions were never recorded as known.
 */
async function persistProgress(
  context: Context,
  stagingBucket: string,
  state: FollowerState,
  knownVersions: KnownVersions
): Promise<void> {
  if (knownVersions.pendingCount > 0) {
    console.log(`Recording ${knownVersions.pendingCount} known version(s)`);
    await knownVersions.flush();
  }
  await saveFollowerState(context, stagingBucket, state);
}

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
  processing: PackumentProcessingContext,
  queueUrl: string,
  persist: PersistState
): Promise<number> {
  const now = Date.now();
  const deep = state.deepScanDue(now);
  const windowMs = deep ? STATE_RETENTION_MS : SCAN_WINDOW_MS;
  const floor = state.floorSeq(windowMs, now);
  if (floor == null) {
    // Cannot happen after seeding, but guards the type.
    console.warn('No checkpoint history; skipping scan');
    return 0;
  }
  // Entries discovered at or below this position were inserted into the feed
  // behind a position we had already read past.
  const lateBoundary = state.newestCheckpointSeq() ?? floor;

  console.log(
    `Starting ${
      deep ? 'deep ' : ''
    }scan of (${floor}, ${head}] (late boundary: ${lateBoundary})`
  );

  let staged = 0;
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
        npm,
        state,
        lateBoundary,
        head,
        processing,
        queueUrl,
        persist
      );
      staged += outcome.staged;
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
  return staged;
}

/**
 * The maximum number of packument fetches per processing chunk. Chunking
 * bounds how much work is lost when the Lambda is killed mid-chunk, and lets
 * the time budget be re-checked between chunks: during a catch-up, a single
 * page can contain thousands of unreceipted entries, far more than fit into
 * one execution.
 */
const METADATA_CHUNK_SIZE = 1_000;

/**
 * Processes one page of change entries: discards everything we already have a
 * receipt for, then works through the remainder in chunks. Each chunk fetches
 * packuments, stages new relevant package versions, records laggy packument
 * expectations and receipts, and persists the state - so completed chunks
 * survive a timeout. Processing stops between chunks when the time budget is
 * exhausted; unprocessed entries carry no receipt and are picked up by the
 * next run.
 *
 * @returns the number of package versions sent for staging, and whether all
 *          entries of the page were processed.
 */
async function processBatch(
  batch: DatabaseChanges,
  metrics: MetricsLogger,
  context: Context,
  npm: CouchChanges,
  state: FollowerState,
  lateBoundary: number,
  head: number,
  processing: PackumentProcessingContext,
  queueUrl: string,
  persist: PersistState
): Promise<{ staged: number; fullyProcessed: boolean }> {
  const startTime = Date.now();
  let staged = 0;
  let fullyProcessed = true;
  try {
    // Entries for deleted packages are ignored, as if they were not in the
    // feed: there is nothing to process, and no receipt is recorded.
    const fresh = batch.results.filter(
      (change) =>
        !change.deleted && change.seq != null && !state.has(Number(change.seq))
    );
    console.log(
      `Received ${batch.totalCount} change entr(ies), ${fresh.length} without a receipt`
    );
    metrics.putMetric(MetricName.CHANGE_COUNT, fresh.length, Unit.Count);

    for (let offset = 0; offset < fresh.length; offset += METADATA_CHUNK_SIZE) {
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
      const chunk = fresh.slice(offset, offset + METADATA_CHUNK_SIZE);

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

      const {
        ok: attached,
        missing,
        failedSeqs,
      } = await npm.attachAllMetadata(chunk);
      metrics.putMetric(
        MetricName.METADATA_FETCH_FAILURES,
        failedSeqs.length,
        Unit.Count
      );

      // The most recent "modified" timestamp observed in the chunk.
      let lastModified: Date | undefined;
      // Emit npm.js replication lag
      for (const { change } of attached) {
        const doc = change.doc as { time?: { modified?: string } } | undefined;
        if (doc?.time?.modified) {
          const modified = new Date(doc.time.modified);
          metrics.putMetric(
            MetricName.NPMJS_CHANGE_AGE,
            startTime - modified.getTime(),
            Unit.Milliseconds
          );
          if (lastModified == null || lastModified < modified) {
            lastModified = modified;
          }
        }
      }

      let chunkStaged = 0;
      if (lastModified && lastModified < DAWN_OF_CONSTRUCTS) {
        console.log(
          `Skipping chunk as the latest modification is ${lastModified}, which is pre-Constructs`
        );
      } else {
        chunkStaged = await processPackuments(
          attached.map((a) => a.change),
          metrics,
          processing
        );
        staged += chunkStaged;

        // Laggy packuments: the registry served an older revision than the
        // feed announced (the versions we did get were processed above), or
        // no packument at all yet. The packument queue checks the package
        // again until the announced revision appears. This happens before the
        // receipts are recorded, so a failure here makes the next run process
        // the chunk again.
        const laggy = attached.filter((a) => a.laggy);
        for (const { change, servedRev, announcedRev } of laggy) {
          console.log(
            `${change.id}: registry packument rev ${servedRev} is behind announced rev ${announcedRev}, sending it to the packument queue`
          );
        }
        for (const { change } of missing) {
          console.log(
            `${change.id}: the registry has no packument for it yet, sending it to the packument queue`
          );
        }
        metrics.putMetric(
          MetricName.MISSING_PACKUMENTS,
          missing.length,
          Unit.Count
        );
        const now = Date.now();
        const request = (
          change: DatabaseChange,
          expectedRev: number,
          reason: PackumentRequestReason
        ): PackumentRequest => ({
          name: change.id,
          expectedRev,
          seq: isNaN(Number(change.seq)) ? undefined : Number(change.seq),
          firstSeen: now,
          reason,
        });
        await enqueuePackumentRequests(queueUrl, [
          ...laggy.map(({ change, announcedRev }) =>
            request(change, announcedRev, 'laggy')
          ),
          ...missing.map(({ change, announcedRev }) =>
            request(change, announcedRev, 'missing')
          ),
        ]);
      }

      // Record a receipt for every entry of the chunk, except those whose
      // metadata fetch failed (a later scan retries them). Then persist, so a
      // timeout cannot undo this chunk.
      const failed = new Set(failedSeqs);
      state.addSeqs(
        chunk
          .map((change) => Number(change.seq))
          .filter((seq) => !isNaN(seq) && !failed.has(seq))
      );
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
  return { staged, fullyProcessed };
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
