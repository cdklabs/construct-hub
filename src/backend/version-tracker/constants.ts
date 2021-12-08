/**
 * The name of an environment variable that contains the bucket name that includes the versions file.
 */
export const ENV_VERSION_TRACKER_BUCKET_NAME = 'VERSION_TRACKER_BUCKET_NAME';

/**
 * The object key of the versions object in the bucket.
 */
export const ENV_VERSION_TRACKER_OBJECT_KEY = 'VERSION_TRACKER_OBJECT_KEY';

export const ENV_PACKAGE_DATA_BUCKET_NAME = 'PACKAGE_DATA_BUCKET_NAME';
export const ENV_PACKAGE_DATA_KEY_PREFIX = 'PACKAGE_DATA_KEY_PREFIX';

export const METRICS_NAMESPACE = 'ConstructHub/VersionTracker';

export const enum MetricName {
  TRACKED_VERSIONS_COUNT = 'TrackedVersionsCount',
  TRACKED_PACKAGES_COUNT = 'TrackedPackagesCount',
}
