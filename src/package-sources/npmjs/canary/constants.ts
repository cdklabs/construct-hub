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
   * A metric tracking whether the npm registry replica (replicate.npmjs.com)
   * is down. The value is 1 when the replica is detected to be down, and 0
   * when the replica is detected to be up.
   */
  NPM_REPLICA_DOWN = 'NpmReplicaIsDown',

  /**
   * A metric tracking HTTP 502 and HTTP 504 errors received while processing.
   * Those are often encountered when the npm servers are overloaded, or
   * otherwise impaired, and could cause alarms we cannot do anything about.
   */
  HTTP_GATEWAY_ERRORS = 'HttpGatewayErrors',
}

export const enum ObjectKey {
  STATE_PREFIX = 'package-canary/',
  STATE_SUFFIX = '.state.json',
}
