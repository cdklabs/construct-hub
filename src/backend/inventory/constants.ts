export const METRICS_NAMESPACE = 'ConstructHub/Inventory';

export const enum MetricName {
  MISSING_METADATA_COUNT = 'MissingPackageMetadataCount',
  MISSING_ASSEMBLY_COUNT = 'MissingAssemblyCount',
  MISSING_PYTHON_DOCS_COUNT = 'MissingPythonDocsCount',
  MISSING_TYPESCRIPT_DOCS_COUNT = 'MissingTypeScriptDocsCount',
  MISSING_TARBALL_COUNT = 'MissingPackageTarballCount',
  PACKAGE_VERSION_COUNT = 'PackageVersionCount',
  PACKAGE_MAJOR_COUNT = 'PackageMajorVersionCount',
  PACKAGE_COUNT = 'PackageCount',
  SUBMODULE_COUNT = 'SubmoduleCount',
  UNKNOWN_OBJECT_COUNT = 'UnknownObjectCount',
}
