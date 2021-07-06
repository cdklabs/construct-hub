export const METRICS_NAMESPACE = 'ConstructHub/Inventory';

export const enum MetricName {
  MISSING_METADATA_COUNT = 'MissingPackageMetadataCount',
  MISSING_ORIGINAL_ASSEMBLY_COUNT = 'MissingOriginalAssemblyCount',
  MISSING_PYTHON_ASSEMBLY_COUNT = 'MissingPythonAssemblyCount',
  MISSING_TARBALL_COUNT = 'MissingPackageTarballCount',
  PACKAGE_VERSION_COUNT = 'PackageVersionCount',
  UNKNOWN_OBJECT_COUNT = 'UnknownObjectCount',
}
