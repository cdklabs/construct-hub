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
   * Number of changes discovered by the overlap sweep that were missed by the
   * regular head-of-feed pass (i.e. rows that were inserted into the CouchDB
   * `_changes` feed behind our cursor).
   */
  LATE_CHANGE_COUNT = 'LateChangeCount',

  /**
   * For each late change discovered by the overlap sweep, the time elapsed
   * between the moment the follower first read past the change's sequence
   * number and the moment the change was discovered. This is a lower bound on
   * the feed's insertion lag, and is the quantity the sweep margin must
   * exceed.
   */
  LATE_CHANGE_LAG = 'LateChangeLag',

  /**
   * Number of changes that could not be processed because the metadata
   * returned by the npm registry was still stale (its revision was older than
   * the revision announced by the `_changes` feed) after the maximum wait.
   * These changes are deferred to the stale-metadata retry queue.
   */
  STALE_METADATA_DEFERRED = 'StaleMetadataDeferred',

  /**
   * Number of previously deferred changes that were successfully recovered
   * from the stale-metadata retry queue (the registry caught up with the
   * revision announced by the `_changes` feed).
   */
  STALE_METADATA_RECOVERED = 'StaleMetadataRecovered',
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
 * The name of the object that contains the follower receipts: the sequence
 * numbers received from the CouchDB `_changes` feed (within the retention
 * window), the rolling time/sequence checkpoints, and the sweep state.
 */
export const RECEIPTS_FILE_NAME = 'couchdb-received-seqs';

/**
 * How far behind the head of the `_changes` feed the overlap sweep re-reads.
 * The npm `_changes` feed occasionally inserts rows *behind* the current
 * `last_seq` (confirmed "normal feed behavior" by npm), so a follower that
 * only ever reads forward will silently miss those changes. The sweep
 * re-reads this margin and processes any row it has no receipt for.
 */
export const SWEEP_MARGIN_MS = 6 * 60 * 60 * 1_000; // 6 hours

/**
 * How often the overlap sweep runs.
 */
export const SWEEP_INTERVAL_MS = 60 * 60 * 1_000; // 1 hour

/**
 * How often a "deep" sweep runs. The deep sweep covers the entire receipts
 * retention window (instead of just `SWEEP_MARGIN_MS`), so that insertion
 * lag *beyond* the regular sweep margin is still observed (via the
 * `LateChangeLag` metric) and can inform tuning of the margin.
 */
export const DEEP_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1_000; // 24 hours

/**
 * How long sequence number receipts and checkpoints are retained. This is
 * the upper bound of what any sweep can cover.
 */
export const RECEIPTS_RETENTION_MS = 24 * 60 * 60 * 1_000; // 24 hours
