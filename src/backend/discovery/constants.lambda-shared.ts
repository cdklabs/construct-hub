export const METRIC_NAMESPACE = 'ConstructHub/Discovery';

export const enum MetricName {
  BATCH_PROCESSING_TIME = 'BatchProcessingTime',
  CHANGE_COUNT = 'ChangeCount',
  INELIGIBLE_LICENSE = 'IneligibleLicense',
  PACKAGE_VERSION_AGE = 'PackageVersionAge',
  PACKAGE_VERSION_COUNT = 'PackageVersionCount',
  RELEVANT_PACKAGE_VERSIONS = 'RelevantPackageVersions',
  REMAINING_TIME = 'RemainingTime',
  STAGING_FAILURE_COUNT = 'StagingFailureCount',
  STAGING_TIME = 'StagingTime',
  UNPROCESSABLE_ENTITY = 'UnprocessableEntity',

  /**
   * Number of package versions that were skipped since they were in the deny list.
   */
  DENIED_COUNT = 'DeniedCount',
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
