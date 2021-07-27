/**
 * The namespace in which metrics are published.
 */
export const METRICS_NAMESPACE = 'ConstructHub/Inventory';

/**
 * Names of available metrics from the Inventory canary function.
 */
export const enum MetricName {
  MISSING_METADATA_COUNT = 'MissingPackageMetadataCount',
  MISSING_ASSEMBLY_COUNT = 'MissingAssemblyCount',
  MISSING_TARBALL_COUNT = 'MissingPackageTarballCount',
  PACKAGE_VERSION_COUNT = 'PackageVersionCount',
  PACKAGE_MAJOR_COUNT = 'PackageMajorVersionCount',
  PACKAGE_COUNT = 'PackageCount',
  SUBMODULE_COUNT = 'SubmoduleCount',
  UNKNOWN_OBJECT_COUNT = 'UnknownObjectCount',

  // Scoped metrics
  PER_LANGUAGE_MISSING_PACKAGES = 'MissingPackageCount',
  PER_LANGUAGE_MISSING_MAJORS = 'MissingMajorVersionCount',
  PER_LANGUAGE_MISSING_VERSIONS = 'MissingPackageVersionCount',
  PER_LANGUAGE_MISSING_SUBMODULES = 'MissingSubmoduleCount',
  PER_LANGUAGE_SUPPORTED_PACKAGES = 'SupportedPackageCount',
  PER_LANGUAGE_SUPPORTED_MAJORS = 'SupportedMajorVersionCount',
  PER_LANGUAGE_SUPPORTED_VERSIONS = 'SupportedPackageVersionCount',
  PER_LANGUAGE_SUPPORTED_SUBMODULES = 'SupportedSubmoduleCount',
  PER_LANGUAGE_UNSUPPORTED_PACKAGES = 'UnsupportedPackageCount',
  PER_LANGUAGE_UNSUPPORTED_MAJORS = 'UnsupportedMajorVersionCount',
  PER_LANGUAGE_UNSUPPORTED_VERSIONS = 'UnsupportedPackageVersionCount',
  PER_LANGUAGE_UNSUPPORTED_SUBMODULES = 'UnsupportedSubmoduleCount',
}

/**
 * The dimension key to use for accessing the language.
 */
export const LANGUAGE_DIMENSION = 'Language';
