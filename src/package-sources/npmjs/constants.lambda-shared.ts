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
   * Number of laggy packuments the follower gave up on: the registry never
   * served the revision announced by the `_changes` feed within the maximum
   * retry age. Any versions the registry did serve have been processed, but a
   * version announced by the feed may be missing until the package publishes
   * again.
   */
  LAGGY_PACKUMENT_GIVE_UPS = 'LaggyPackumentGiveUps',
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
 * The name of the object that contains the list of known versions.
 */
export const KNOWN_VERSIONS_FILE_NAME = 'couchdb-known-versions.2';

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
 * How long the follower keeps re-checking a laggy packument (a package whose
 * registry packument is behind the revision announced by the `_changes` feed)
 * before giving up on the announced revision.
 */
export const LAGGY_PACKUMENT_GIVE_UP_MS = 24 * 60 * 60 * 1_000; // 24 hours
