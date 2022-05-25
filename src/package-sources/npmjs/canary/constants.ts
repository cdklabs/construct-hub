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

  /**
   * The estimated lag between the npm registry replica (replicate.npmjs.com)
   * and the primary registry (registry.npmjs.com). This cannot be measured
   * directly because the primary does not expose the relevant CouchDB endpoints,
   * so we use the probe package to get a low-resolution view of this.
   */
  NPM_REPLICA_LAG = 'EstimatedNpmReplicaLag',

  /**
   * A metric tracking whether the npm registry replica (replicate.npmjs.com)
   * is down. The value is 1 when the replica is detected to be down, and 0
   * when the replica is detected to be up.
   */
  NPM_REPLICA_DOWN = 'NpmReplicaIsDown',
}

export const enum ObjectKey {
  STATE_PREFIX = 'package-canary/',
  STATE_SUFFIX = '.state.json',
}
