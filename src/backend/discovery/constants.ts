export const METRICS_NAMESPACE = 'ConstructHub/Discovery';
export const DISCOVERY_MARKER_KEY = 'couchdb-last-transaction-id';

export const enum MetricName {
  BATCH_PROCESSING_TIME = 'BatchProcessingTime',
  CHANGE_COUNT = 'ChangeCount',
  NEW_PACKAGE_VERSIONS = 'NewPackageVersions',
  INELIGIBLE_LICENSE = 'IneligibleLicense',
  NPMJS_CHANGE_AGE = 'NpmJsChangeAge',
  PACKAGE_VERSION_AGE = 'PackageVersionAge',
  STAGED_PACKAGE_VERSION_AGE = 'StagedPackageVersionAge',
  PACKAGE_VERSION_COUNT = 'PackageVersionCount',
  RELEVANT_PACKAGE_VERSIONS = 'RelevantPackageVersions',
  REMAINING_TIME = 'RemainingTime',
  STAGING_FAILURE_COUNT = 'StagingFailureCount',
  STAGING_TIME = 'StagingTime',
  UNPROCESSABLE_ENTITY = 'UnprocessableEntity',
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
