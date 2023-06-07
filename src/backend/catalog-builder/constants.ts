export const METRICS_NAMESPACE = 'ConstructHub/CatalogBuilder';

export const enum MetricName {
  FAILED_PACKAGES_ON_RECREATION = 'FailedPackagesOnRecreation',
  MISSING_CONSTRUCT_FRAMEWORK_COUNT = 'MissingConstructFrameworkCount',
  MISSING_CONSTRUCT_FRAMEWORK_VERSION_COUNT = 'MissingConstructFrameworkVersionCount',
  REGISTERED_PACKAGES_MAJOR_VERSION = 'RegisteredPackagesMajorVersion',
  REGISTERED_PACKAGES = 'RegisteredPackages',
}
