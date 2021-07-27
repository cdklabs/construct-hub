export const METRICS_NAMESPACE = 'ConstructHub/Ingestion';

export const enum MetricName {
  FOUND_LICENSE_FILE = 'FoundLicenseFile',
  INELIGIBLE_LICENSE = 'IneligibleLicense',
  INVALID_ASSEMBLY = 'InvalidAssembly',
  INVALID_TARBALL = 'InvalidTarball',
  MISMATCHED_IDENTITY_REJECTIONS = 'MismatchedIdentityRejections',
}
