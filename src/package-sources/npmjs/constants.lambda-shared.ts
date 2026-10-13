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

  /** No longer emitted. */
  LAGGY_PACKUMENTS = 'LaggyPackuments',

  /** No longer emitted. */
  LAGGY_PACKUMENTS_RECOVERED = 'LaggyPackumentsRecovered',

  /** No longer emitted, see `PACKUMENT_GIVE_UPS`. */
  LAGGY_PACKUMENT_GIVE_UPS = 'LaggyPackumentGiveUps',

  /** No longer emitted, see `PACKUMENT_DELAY`. */
  LAGGY_PACKUMENT_LAG = 'LaggyPackumentLag',

  /** No longer emitted. */
  MISSING_PACKUMENTS = 'MissingPackuments',

  /** No longer emitted. */
  MISSING_PACKUMENTS_RECOVERED = 'MissingPackumentsRecovered',

  /** No longer emitted, see `PACKUMENT_GIVE_UPS`. */
  MISSING_PACKUMENT_GIVE_UPS = 'MissingPackumentGiveUps',

  /**
   * Number of packument checks where the registry did not serve the announced
   * revision: it served an older one, had no packument, or could not be
   * reached. Counted on every check, so it shows registry trouble while it
   * happens.
   */
  FAILED_PACKUMENT_RETRIEVALS = 'FailedPackumentRetrievals',

  /**
   * Number of packument requests given up on, because the registry still had
   * not served the announced revision after a day. Emitted with a `Reason`
   * dimension (see `PackumentGiveUpReason`), and without it for the total. A
   * version announced by the changes feed may be missing until the package
   * publishes again.
   */
  PACKUMENT_GIVE_UPS = 'PackumentGiveUps',

  /**
   * For packuments the registry served only after earlier checks failed: how
   * long that took, in seconds, from when the follower read the change entry.
   */
  PACKUMENT_DELAY = 'PackumentDelay',
}

/**
 * Why a packument request was given up on: the value of the `Reason`
 * dimension of the `PackumentGiveUps` metric. Decided by the last check.
 */
export const enum PackumentGiveUpReason {
  /** The registry served an older revision than announced. */
  LAGGY = 'Laggy',
  /** The registry had no packument for the package (HTTP 404). */
  MISSING = 'Missing',
  /** The registry could not be reached. */
  UNREACHABLE = 'Unreachable',
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
 * The shortest and longest wait before the next attempt. In between, a request
 * waits as long as it is already old, so waits double with each attempt. SQS
 * caps a visibility timeout at 12 hours.
 */
export const PACKUMENT_MIN_RETRY_DELAY_SECONDS = 5 * 60; // 5 minutes
export const PACKUMENT_MAX_RETRY_DELAY_SECONDS = 6 * 60 * 60; // 6 hours

/**
 * Waits are randomly shortened or lengthened by up to this fraction, so that
 * requests made together do not keep coming back together.
 */
export const PACKUMENT_RETRY_JITTER = 0.2;

/**
 * How old a request gets before it is given up on, if its last check still
 * did not find the announced revision.
 */
export const PACKUMENT_MAX_AGE_MS = 24 * 60 * 60 * 1_000; // 24 hours

/**
 * The number of attempts before a request moves to the dead-letter queue (the
 * queue's `maxReceiveCount`). Only a backstop for requests that keep failing
 * the processor: with the waits above, a request passes `PACKUMENT_MAX_AGE_MS`
 * after about 12 attempts, and the rest leaves room for attempts that timed
 * out.
 */
export const PACKUMENT_MAX_ATTEMPTS = 20;
