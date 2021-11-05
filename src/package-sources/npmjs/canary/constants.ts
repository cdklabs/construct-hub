export const enum Environment {
  PACKAGE_NAME = 'PACKAGE_NAME',
  PACKAGE_CANARY_BUCKET_NAME = 'PACKAGE_CANARY_BUCKET_NAME',
  CONSTRUCT_HUB_BASE_URL = 'CONSTRUCT_HUB_BASE_URL',
}

export const METRICS_NAMESPACE = 'ConstructHub/PackageCanary';

export const enum MetricName {
  /**
   * The time elapsed since a package was published to npmjs.com, while it has
   * not been detected in the catalog by the package canary.
   *
   * This metrics is only emitted until the package has been detected.
   */
  DWELL_TIME = 'DwellTime',

  /**
   * The time it took between a package's publication to npmjs.com and when the
   * package canary detected the package as available in the catalog.
   *
   * This metric is not emitted until the package has actually been detected.
   */
  TIME_TO_CATALOG = 'TimeToCatalog',

  /**
   * The number of package versions that were tracked at the beginning of the
   * package canary execution that produced the data point.
   */
  TRACKED_VERSION_COUNT = 'TrackedVersionCount',
}

export const enum ObjectKey {
  STATE_PREFIX = 'package-canary/',
  STATE_SUFFIX = '.state.json',
}
