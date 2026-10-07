import * as console from 'console';
import { InvokeCommand } from '@aws-sdk/client-lambda';
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
  LAGGY_PACKUMENT_GIVE_UP_MS,
} from './constants.lambda-shared';
import {
  CouchChanges,
  DatabaseChange,
  DatabaseChanges,
  parseSequentialRevision,
} from './couch-changes.lambda-shared';
import { FollowerState } from './follower-state.lambda-shared';
import { KnownVersions } from './known-versions.lambda-shared';
import { PackageVersion } from './stage-and-notify.lambda';
import {
  loadContentFromS3,
  MarkerFileSchema,
  putObject,
} from './staging-bucket.lambda-shared';
import { DenyListClient } from '../../backend/deny-list/client.lambda-shared';
import { LicenseListClient } from '../../backend/license-list/client.lambda-shared';
import { LAMBDA_CLIENT } from '../../backend/shared/aws.lambda-shared';
import { compressContent } from '../../backend/shared/compress-content.lambda-shared';
import { requireEnv } from '../../backend/shared/env.lambda-shared';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const normalizeNPMMetadata = require('normalize-registry-metadata');

const CONSTRUCT_KEYWORDS: ReadonlySet<string> = new Set([
  'cdk',
  'aws-cdk',
  'awscdk',
  'cdk8s',
  'cdktf',
]);
const NPM_REPLICA_REGISTRY_URL = 'https://replicate.npmjs.com/';

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

/**
 * Laggy packuments are only re-checked while at least this much time remains
 * in the Lambda execution, so that re-checks cannot starve the scan.
 */
const LAGGY_RETRY_TIME_BUDGET_MS = 240_000;

/**
 * The maximum number of laggy packuments re-checked per run.
 */
const MAX_LAGGY_RETRIES_PER_RUN = 50;

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
 *    the follower records the expectation and keeps re-checking on subsequent
 *    runs until the announced revision appears or the expectation ages out.
 *
 * npm registry API docs: https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md
 *
 * @param context a Lambda execution context
 */
export async function handler(event: ScheduledEvent, context: Context) {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  const stagingBucket = requireEnv('BUCKET_NAME');
  const stagingFunction = requireEnv('FUNCTION_NAME');
  const knownVersions = new KnownVersions(
    requireEnv(ENV_KNOWN_VERSIONS_TABLE_NAME)
  );

  const denyList = await DenyListClient.newClient();
  const licenseList = await LicenseListClient.newClient();

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
    // Re-check laggy packuments (packages whose registry packument was behind
    // the revision announced by the feed when we first saw them).
    await retryLaggyPackuments(
      context,
      npm,
      state,
      stagingFunction,
      denyList,
      licenseList,
      knownVersions
    );

    // Scan the trailing window of the feed. Progress is persisted after
    // every processed chunk (see PersistState), so even a run that is hard
    // killed by the Lambda timeout keeps its completed work.
    const persist: PersistState = () =>
      persistProgress(context, stagingBucket, state, knownVersions);
    await runScan(
      context,
      npm,
      state,
      head,
      stagingFunction,
      denyList,
      licenseList,
      knownVersions,
      persist
    );

    // The laggy packument gauge is emitted at the end of the run, so it
    // reflects the expectations recorded by this run's scan (emitting it during
    // the retry phase would always read the trough: after recoveries, before
    // new expectations are recorded).
    await metricScope((metrics) => async () => {
      metrics.setDimensions({});
      metrics.putMetric(
        MetricName.LAGGY_PACKUMENTS,
        state.laggyPackumentCount,
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
  stagingFunction: string,
  denyList: DenyListClient,
  licenseList: LicenseListClient,
  knownVersions: KnownVersions,
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
        stagingFunction,
        denyList,
        licenseList,
        knownVersions,
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
  stagingFunction: string,
  denyList: DenyListClient,
  licenseList: LicenseListClient,
  knownVersions: KnownVersions,
  persist: PersistState
): Promise<{ staged: number; fullyProcessed: boolean }> {
  const startTime = Date.now();
  let staged = 0;
  let fullyProcessed = true;
  try {
    const fresh = batch.results.filter(
      (change) => change.seq != null && !state.has(Number(change.seq))
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

      const { ok: attached, failedSeqs } = await npm.attachAllMetadata(chunk);
      metrics.putMetric(
        MetricName.METADATA_FETCH_FAILURES,
        failedSeqs.length,
        Unit.Count
      );

      // The most recent "modified" timestamp observed in the chunk.
      let lastModified: Date | undefined;
      // Emit npm.js replication lag
      for (const { change } of attached) {
        const doc = change.doc as Change['doc'] | undefined;
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
        // Laggy packuments: the registry served an older revision than the
        // feed announced. Process the versions we did get, and record the
        // expectation so the announced revision is re-checked on later runs.
        for (const laggy of attached.filter((a) => a.laggy)) {
          console.log(
            `${laggy.change.id}: registry packument rev ${laggy.servedRev} is behind announced rev ${laggy.announcedRev}, recording laggy packument`
          );
          state.recordLaggyPackument(
            laggy.change.id,
            laggy.announcedRev,
            isNaN(Number(laggy.change.seq))
              ? undefined
              : Number(laggy.change.seq)
          );
        }

        const versionInfos = await getRelevantVersionInfos(
          attached.map((a) => a.change) as unknown as readonly Change[],
          metrics,
          denyList,
          licenseList,
          knownVersions
        );
        console.log(
          `Identified ${versionInfos.length} relevant package version update(s)`
        );
        metrics.putMetric(
          MetricName.RELEVANT_PACKAGE_VERSIONS,
          versionInfos.length,
          Unit.Count
        );
        await stageVersions(versionInfos, stagingFunction, knownVersions);
        chunkStaged = versionInfos.length;
        staged += chunkStaged;
      }

      // Record receipts for every entry of the chunk (including deleted or
      // unpublished packages: they were received and deliberately skipped) -
      // except entries whose metadata fetch failed, so a later scan retries
      // them. Then persist, so a timeout cannot undo this chunk.
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

//#region Laggy packuments
/**
 * Re-checks laggy packuments: packages whose registry packument was behind
 * the revision announced by the changes feed. Each re-check processes
 * whatever the registry serves now (new versions are staged), and the
 * expectation is cleared when the announced revision appears - or aged out
 * after `LAGGY_PACKUMENT_GIVE_UP_MS`, at which point a version announced by
 * the feed may be missing until the package publishes again.
 *
 * @returns the number of package versions sent for staging.
 */
async function retryLaggyPackuments(
  context: Context,
  npm: CouchChanges,
  state: FollowerState,
  stagingFunction: string,
  denyList: DenyListClient,
  licenseList: LicenseListClient,
  knownVersions: KnownVersions
): Promise<number> {
  let staged = 0;
  await metricScope((metrics) => async () => {
    metrics.setDimensions({});
    let recovered = 0;
    let gaveUp = 0;
    const now = Date.now();
    for (const laggy of state
      .laggyPackuments()
      .slice(0, MAX_LAGGY_RETRIES_PER_RUN)) {
      if (context.getRemainingTimeInMillis() < LAGGY_RETRY_TIME_BUDGET_MS) {
        break;
      }
      const doc = await npm.getPackageDoc(laggy.name);
      if (doc == null || doc._rev == null) {
        console.log(
          `Laggy packument for ${laggy.name} is no longer available in the registry, dropping the expectation`
        );
        state.removeLaggyPackument(laggy.name);
        continue;
      }

      // Process whatever the registry serves now; knownVersions dedupes.
      const change: DatabaseChange = {
        changes: [{ rev: doc._rev as string }],
        deleted: false,
        id: laggy.name,
        seq: laggy.seq,
        doc,
      };
      const versionInfos = await getRelevantVersionInfos(
        [change] as unknown as readonly Change[],
        metrics,
        denyList,
        licenseList,
        knownVersions
      );
      await stageVersions(versionInfos, stagingFunction, knownVersions);
      staged += versionInfos.length;

      if (parseSequentialRevision(doc._rev as string) >= laggy.expectedRev) {
        console.log(
          `Laggy packument for ${laggy.name} caught up (rev ${doc._rev} >= ${laggy.expectedRev})`
        );
        state.removeLaggyPackument(laggy.name);
        recovered += 1;
      } else if (now - laggy.firstSeen > LAGGY_PACKUMENT_GIVE_UP_MS) {
        console.warn(
          `Giving up on laggy packument for ${
            laggy.name
          }: the registry never served rev ${
            laggy.expectedRev
          } (first seen ${new Date(
            laggy.firstSeen
          ).toISOString()}). A version announced by the changes feed may be missing until the package publishes again.`
        );
        state.removeLaggyPackument(laggy.name);
        gaveUp += 1;
      }
    }
    metrics.putMetric(
      MetricName.LAGGY_PACKUMENTS_RECOVERED,
      recovered,
      Unit.Count
    );
    metrics.putMetric(MetricName.LAGGY_PACKUMENT_GIVE_UPS, gaveUp, Unit.Count);
  })();
  return staged;
}
//#endregion

/**
 * Sends the provided package version updates to the staging function
 * ("fire-and-forget"), and records them as known versions.
 */
async function stageVersions(
  versionInfos: readonly UpdatedVersion[],
  stagingFunction: string,
  knownVersions: KnownVersions
): Promise<void> {
  await Promise.all(
    versionInfos.map(async ({ packageName, infos, modified, seq }) => {
      const invokeArgs: PackageVersion = {
        integrity: infos.dist.shasum,
        modified: modified.toISOString(),
        name: infos.name,
        seq: seq?.toString(),
        tarballUrl: infos.dist.tarball,
        version: infos.version,
      };
      // "Fire-and-forget" invocation here.
      console.log(`Sending ${invokeArgs.tarballUrl} for staging`);
      await LAMBDA_CLIENT.send(
        new InvokeCommand({
          FunctionName: stagingFunction,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify(invokeArgs)),
        })
      );
      // Record that this is now a "known" version (no need to re-discover)
      knownVersions.add(packageName, infos.version);
    })
  );
}

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
        `Loaded follower state: ${state.receiptCount} receipt(s), ${state.checkpointCount} checkpoint(s), ${state.laggyPackumentCount} laggy packument(s)`
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
    `Updating follower state (${state.receiptCount} receipt(s), ${state.checkpointCount} checkpoint(s), ${state.laggyPackumentCount} laggy packument(s))`
  );
  await putObject(context, stagingBucket, FOLLOWER_STATE_FILE_NAME, buffer, {
    ContentType: 'text/plain',
    ContentEncoding: contentEncoding,
  });
  console.log('Successfully updated follower state');
}

//#endregion

/**
 * Obtains the `VersionInfo` corresponding to the modified version(s) in the
 * provided `Change` objects, ensures they are relevant (construct libraries),
 * and returns those only.
 *
 * Known versions are only looked up for packages that have at least one
 * construct library version: only those versions are ever recorded, so every
 * other package has no known versions by definition. Changes are processed
 * concurrently; the result keeps their order.
 *
 * @param changes the changes to be processed.
 * @param metrics the metrics logger to use.
 * @param denyList deny list client
 *
 * @returns a list of `VersionInfo` objects
 */
async function getRelevantVersionInfos(
  changes: readonly Change[],
  metrics: MetricsLogger,
  denyList: DenyListClient,
  licenseList: LicenseListClient,
  knownVersions: KnownVersions
): Promise<readonly UpdatedVersion[]> {
  const perChange = await Promise.all(
    changes.map((change) => relevantVersionInfosOf(change))
  );
  return perChange.flat();

  async function relevantVersionInfosOf(
    change: Change
  ): Promise<readonly UpdatedVersion[]> {
    // Filter out all elements that don't have a "name" in the document, as
    // these are schemas, which are not relevant to our business here.
    if (change.doc.name === undefined) {
      console.error(
        `[${change.seq}] Changed document contains no 'name': ${change.id}`
      );
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      return [];
    }

    // The normalize function change the object in place, if the doc object is invalid it will return undefined
    if (normalizeNPMMetadata(change.doc) === undefined) {
      console.error(
        `[${change.seq}] Changed document invalid, npm normalize returned undefined: ${change.id}`
      );
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      return [];
    }

    // Sometimes, there are no versions in the document. We skip those.
    if (change.doc.versions == null) {
      console.error(
        `[${change.seq}] Changed document contains no 'versions': ${change.id}`
      );
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      return [];
    }

    // Sometimes, there is no 'time' entry in the document. We skip those.
    if (change.doc.time == null) {
      console.error(
        `[${change.seq}] Changed document contains no 'time': ${change.id}`
      );
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      return [];
    }

    const name = change.doc.name;
    const isRelevant = Object.values(change.doc.versions).some(
      (infos) => infos != null && isConstructLibrary(infos)
    );

    // Get the last modification date from the change
    const packageVersionUpdates = Object.entries(change.doc.time)
      // Ignore the "created" and "modified" keys here
      .filter(([key]) => key !== 'created' && key !== 'modified')
      // Parse all the dates to ensure they are comparable
      .map(([version, isoDate]) => [version, new Date(isoDate)] as const);
    metrics.putMetric(
      MetricName.PACKAGE_VERSION_COUNT,
      packageVersionUpdates.length,
      Unit.Count
    );

    const result = new Array<UpdatedVersion>();
    const unpublishedVersions: string[] = [];
    for (const [version, modified] of packageVersionUpdates) {
      if (isRelevant && (await knownVersions.has(name, version))) {
        continue;
      }
      const infos = change.doc.versions[version];
      if (infos == null) {
        // Could be the version in question was un-published.
        unpublishedVersions.push(`${name}@${version}`);
      } else if (isConstructLibrary(infos)) {
        // skip if this package is denied
        const denied = denyList.lookup(infos.name, infos.version);
        if (denied) {
          console.log(
            `[${change.seq}] Package denied: ${JSON.stringify(denied)}`
          );
          knownVersions.add(name, version);
          metrics.putMetric(MetricName.DENY_LISTED_COUNT, 1, Unit.Count);
          continue;
        }

        metrics.putMetric(
          MetricName.PACKAGE_VERSION_AGE,
          Date.now() - modified.getTime(),
          Unit.Milliseconds
        );
        const isEligible =
          licenseList.lookup(infos.license ?? 'UNLICENSED') != null;
        metrics.putMetric(
          MetricName.INELIGIBLE_LICENSE,
          isEligible ? 0 : 1,
          Unit.Count
        );
        if (isEligible) {
          result.push({
            packageName: name,
            infos,
            modified,
            seq: change.seq,
          });
        } else {
          console.log(
            `[${
              change.seq
            }] Package "${name}@${version}" does not use allow-listed license: ${
              infos.license ?? 'UNLICENSED'
            }`
          );
          knownVersions.add(name, version);
        }
      }
      // Else this is not a construct library, so we'll just ignore it...
    }

    if (unpublishedVersions.length > 0) {
      console.log(
        `[${
          change.seq
        }] Could not find info for the following versions. Were they un-published?\n${unpublishedVersions.join(
          ',\n'
        )}`
      );
    }
    return result;
  }

  /**
   * This determines whether a package is "interesting" to ConstructHub or not. This is related but
   * not necessarily identical to the logic in the ingestion process that annotates package metadata
   * with a construct framework name + version (those could ultimately be re-factored to share more
   * of the logic/heuristics, though).
   *
   * Concretely, it checks for a list of known "official" packages for various construct frameworks,
   * and packages that have a dependency on such a package. It also has a keywords allow-list as a
   * fall-back (the current dependency-based logic does not consider transitive dependencies and
   * might hence miss certain rare use-cases, which keywords would rescue).
   */
  function isConstructLibrary(infos: VersionInfo): boolean {
    if (infos.jsii == null) {
      return false;
    }
    // The "constructs" package is a sign of a constructs library
    return (
      isConstructFrameworkPackage(infos.name) ||
      // Recursively apply on dependencies
      Object.keys(infos.dependencies ?? {}).some(isConstructFrameworkPackage) ||
      Object.keys(infos.devDependencies ?? {}).some(
        isConstructFrameworkPackage
      ) ||
      Object.keys(infos.peerDependencies ?? {}).some(
        isConstructFrameworkPackage
      ) ||
      // Keyword-based fallback
      infos.keywords?.some((kw) => CONSTRUCT_KEYWORDS.has(kw))
    );
  }

  /**
   * Package is one of the known construct framework's first party packages:
   * - @aws-cdk/*
   * - @cdktf/*
   * - cdk8s or cdk8s-plus
   */
  function isConstructFrameworkPackage(name: string): boolean {
    // IMPORTANT NOTE: Prefix matching should only be used for @scope/ names.

    // The low-level constructs package
    return (
      name === 'constructs' ||
      // AWS CDK Packages
      name === 'aws-cdk-lib' ||
      name === 'monocdk' ||
      name.startsWith('@aws-cdk/') ||
      // CDK8s packages
      name === 'cdk8s' ||
      /^cdk8s-plus(?:-(?:17|20|21|22))?$/.test(name) ||
      // CDKTf packages
      name === 'cdktf' ||
      name.startsWith('@cdktf/')
    );
  }
}

/**
 * The scheme of a package version in the update. Includes the package.json keys, as well as some additional npm metadata
 * @see https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#version
 */
export interface VersionInfo {
  readonly dependencies?: { readonly [name: string]: string };
  readonly devDependencies?: { readonly [name: string]: string };
  readonly peerDependencies?: { readonly [name: string]: string };
  readonly jsii: unknown;
  readonly license?: string;
  readonly name: string;
  readonly [key: string]: unknown;
  readonly keywords: string[];
  readonly dist: {
    readonly shasum: string;
    readonly tarball: string;
  };
  readonly version: string;
}

interface UpdatedVersion {
  /**
   * The name of the package document the version was found in (the key under
   * which known versions are recorded).
   */
  readonly packageName: string;

  /**
   * The `VersionInfo` for the modified package version.
   */
  readonly infos: VersionInfo;

  /**
   * The time at which the `VersionInfo` was last modified.
   */
  readonly modified: Date;

  /**
   * The CouchDB transaction number for the update.
   */
  readonly seq?: string | number;
}

interface Document {
  /**
   * a List of all Version objects for the package
   */
  readonly versions: { [key: string]: VersionInfo | undefined };

  /**
   * The package's name.
   */
  readonly name: string;

  /**
   * Timestamps associated with this document. The values are ISO-8601 encoded
   * timestamps.
   */
  readonly time: {
    readonly created: string;
    readonly modified: string;
    readonly [version: string]: string;
  };

  readonly [key: string]: unknown;
}

interface Change extends DatabaseChange {
  readonly doc: Document;
}
