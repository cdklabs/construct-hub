export const METRICS_NAMESPACE = 'ConstructHub/PackageSource/NpmJs/Follower';

export const enum MetricName {
  BATCH_PROCESSING_TIME = 'BatchProcessingTime',
  CHANGE_COUNT = 'ChangeCount',
  INELIGIBLE_LICENSE = 'IneligibleLicense',
  LAST_SEQ = 'LastSeq',
  NPMJS_CHANGE_AGE = 'NpmJsChangeAge',
  PACKAGE_VERSION_AGE = 'PackageVersionAge',
  PACKAGE_VERSION_COUNT = 'PackageVersionCount',
  RELEVANT_PACKAGE_VERSIONS = 'RelevantPackageVersions',
  REMAINING_TIME = 'RemainingTime',
  UNPROCESSABLE_ENTITY = 'UnprocessableEntity',

  /**
   * Number of package versions that were skipped since they were in the deny list.
   */
  DENY_LISTED_COUNT = 'DenyListedCount',

  /**
   * Number of change entries discovered by a scan that were inserted into the
   * `_changes` feed behind a position the follower had already read past
   * ("late insertion").
   */
  LATE_CHANGE_COUNT = 'LateChangeCount',

  /**
   * For each late change entry, the time elapsed between the moment the
   * follower first read past the entry's sequence number and the moment the
   * entry was discovered. This is a lower bound on the feed's insertion lag,
   * and is the quantity the scan window must exceed.
   */
  LATE_CHANGE_LAG = 'LateChangeLag',

  /**
   * Number of change entries whose registry metadata could not be fetched
   * (after transient-error retries). These entries are not receipted, so a
   * later scan retries them.
   */
  METADATA_FETCH_FAILURES = 'MetadataFetchFailures',

  /**
   * The number of packages for which the registry packument is still behind
   * the revision announced by the `_changes` feed ("laggy packuments"). The
   * versions served so far have been processed; the follower keeps re-checking
   * for the announced revision.
   */
  LAGGY_PACKUMENTS = 'LaggyPackuments',

  /**
   * Number of laggy packuments for which the registry caught up with the
   * revision announced by the `_changes` feed.
   */
  LAGGY_PACKUMENTS_RECOVERED = 'LaggyPackumentsRecovered',

  /**
   * Number of laggy packuments given up on: the registry never
   * served the revision announced by the `_changes` feed within the maximum
   * retry age. Any versions the registry did serve have been processed, but a
   * version announced by the feed may be missing until the package publishes
   * again.
   */
  LAGGY_PACKUMENT_GIVE_UPS = 'LaggyPackumentGiveUps',

  /**
   * How long a laggy packument took to catch up (or until it was given up
   * on), measured from when the follower first saw it.
   */
  LAGGY_PACKUMENT_LAG = 'LaggyPackumentLag',

  /**
   * Number of change entries for which the registry had no packument at all
   * (HTTP 404) when the follower processed them. Usually a new package that
   * has not replicated to the registry yet; they are re-checked like laggy
   * packuments.
   */
  MISSING_PACKUMENTS = 'MissingPackuments',

  /**
   * Number of missing packuments the registry has since served.
   */
  MISSING_PACKUMENTS_RECOVERED = 'MissingPackumentsRecovered',

  /**
   * Number of missing packuments given up on: the registry never served a
   * packument for the package within the maximum retry age. Usually an old
   * change entry for a deleted package.
   */
  MISSING_PACKUMENT_GIVE_UPS = 'MissingPackumentGiveUps',
}

export const enum S3KeyPrefix {
  /**
   * Key prefix used by the built-in discovery function to store failed records.
   */
  FAILED_KEY_PREFIX = 'failed/',

  /**
   * Key prefix used by the built-in discovery function to stage tarballs.
   */
  STAGED_KEY_PREFIX = 'staged/',
}

/**
 * The name of the object that contains the last transaction marker.
 */
export const MARKER_FILE_NAME = 'couchdb-last-transaction-id.2';

/**
 * The name of the object that contains the list of known versions. Known
 * versions are now kept in a DynamoDB table; this file is only read once, by
 * the migration that seeds the table of an existing deployment.
 */
export const KNOWN_VERSIONS_FILE_NAME = 'couchdb-known-versions.2';

/**
 * The environment variable holding the name of the known versions table.
 */
export const ENV_KNOWN_VERSIONS_TABLE_NAME = 'KNOWN_VERSIONS_TABLE_NAME';

/**
 * The attribute names of the known versions table. The table is keyed by
 * package name (partition key) and version (sort key); an item exists for
 * every package version the follower has processed.
 */
export const enum KnownVersionsAttribute {
  NAME = 'name',
  VERSION = 'version',
}

/**
 * The name of the object that contains the follower state: receipts for the
 * change entries received from the `_changes` feed, rolling time/sequence
 * checkpoints, laggy packument expectations, and deep scan bookkeeping.
 */
export const FOLLOWER_STATE_FILE_NAME = 'couchdb-follower-state';

/**
 * How far behind the head of the `_changes` feed each regular scan re-reads.
 * The feed occasionally makes change entries visible *behind* positions that
 * were already read (npm calls this "normal feed behavior"), so a follower
 * that only ever reads forward silently misses those entries. Every scan
 * covers this window and processes any entry it has no receipt for.
 */
export const SCAN_WINDOW_MS = 6 * 60 * 60 * 1_000; // 6 hours

/**
 * How often a "deep" scan runs. The deep scan covers the entire state
 * retention window (instead of just `SCAN_WINDOW_MS`), so that insertion lag
 * *beyond* the regular scan window is still observed (via the `LateChangeLag`
 * metric) and can inform tuning of the window.
 */
export const DEEP_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1_000; // 24 hours

/**
 * How long receipts and checkpoints are retained. This is the upper bound of
 * what any scan can cover.
 */
export const STATE_RETENTION_MS = 24 * 60 * 60 * 1_000; // 24 hours

/**
 * The npm registry replica serving the `_changes` feed.
 */
export const NPM_REPLICA_REGISTRY_URL = 'https://replicate.npmjs.com/';

/**
 * The environment variable holding the URL of the packument queue: requests
 * to process a package from the registry, retried with back-off until the
 * registry serves the revision announced by the `_changes` feed.
 */
export const ENV_PACKUMENT_QUEUE_URL = 'PACKUMENT_QUEUE_URL';

/**
 * How long a new packument request waits before it is first processed.
 */
export const PACKUMENT_INITIAL_DELAY_SECONDS = 5 * 60; // 5 minutes

/**
 * How long a packument request waits before the next attempt, after an
 * attempt that did not find the announced revision. Entry `n` is the wait
 * after attempt `n + 1`. SQS caps a message's visibility timeout at 12 hours
 * from when it was received, so no wait may be that long.
 *
 * Together with the initial delay, the last attempt happens about 27 hours
 * after the request was made. A request that still finds an old revision
 * then is given up on, and moves to the dead-letter queue.
 */
export const PACKUMENT_RETRY_BACKOFF_SECONDS: readonly number[] = [
  5 * 60, // 5 minutes
  15 * 60, // 15 minutes
  30 * 60, // 30 minutes
  60 * 60, // 1 hour
  2 * 60 * 60, // 2 hours
  4 * 60 * 60, // 4 hours
  8 * 60 * 60, // 8 hours
  11 * 60 * 60, // 11 hours
];

/**
 * The number of attempts made for a packument request before it moves to the
 * dead-letter queue (the queue's `maxReceiveCount`).
 */
export const PACKUMENT_MAX_ATTEMPTS =
  PACKUMENT_RETRY_BACKOFF_SECONDS.length + 1;
