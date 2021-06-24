/**
 * Key prefix used by the built-in discovery function to stage tarballs.
 */
export const STAGED_KEY_PREFIX = 'staged/';

/**
 * The key used to store the last transaction marker in the discovery function.
 */
export const DISCOVERY_MARKER_KEY = 'couchdb-last-transaction-id';

/**
 * If an object by this key exists, the next execution of the npm catalog
 * follower function will ignore an existing marker file, and create a new one
 * instead (the reset beacon is then deleted).
 */
export const RESET_BEACON_KEY = `${DISCOVERY_MARKER_KEY}.reset`;

export const METRIC_NAMESPACE = 'ConstructHub/Discovery';
export const METRIC_NAME_BATCH_PROCESSING_TIME = 'BatchProcessingTime';
export const METRIC_NAME_BATCH_SIZE = 'BatchSize';
export const METRIC_NAME_NEW_PACKAGE_VERSIONS = 'NewPackageVersions';
export const METRIC_NAME_PACKAGE_VERSION_AGE = 'PackageVersionAge';
export const METRIC_NAME_RELEVANT_PACKAGE_VERSIONS = 'RelevantPackageVersions';
export const METRIC_NAME_REMAINING_TIME = 'RemainingTime';
export const METRIC_NAME_STAGED_PACKAGE_VERSION_AGE = 'StagedPackageVersionAge';
export const METRIC_NAME_STAGING_TIME = 'StagingTime';
export const METRIC_NAME_UNPROCESSABLE_ENTITY = 'UnprocessableEntity';
