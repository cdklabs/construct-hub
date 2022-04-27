/**
 * Namespace for ReleaseNotes metrics
 */
export const METRICS_NAMESPACE = 'ConstructHub/ReleaseNotes';
/**
 * Metric name used when there are change log fetch error
 */
export const ChangelogFetchError = 'ChangelogFetchError';
/**
 * Metric name used when the package.json for the package is not a valid JSON file
 */
export const InvalidPackageJson = 'InvalidPackageJson';
/**
 * Metric name used when package.tar.gz is not a valid package
 */
export const InvalidTarball = 'InvalidTarball';
/**
 * Metric name used when github API quota is exhausted
 */
export const RequestQuotaExhausted = 'RequestQuotaExhausted';
/**
 * metric emitted when the error is generic and not categorized
 */
export const UnknownError = 'UnknownError';
/**
 * metric emitted when changelog is present for the package
 */
export const PackageWithChangeLog = 'PackageWithChangeLog';
/**
 * metric emitted when the package.json does not contain repository info or an
 * un supported VCS
 */
export const UnSupportedRepo = 'UnSupportedRepo';
/**
 * Metric emitted when the URL for tarball is not an S3 url
 */
export const UnSupportedTarballUrl = 'UnSupportedTarballUrl';
/**
 * metric emitted when Github credentials are invalid
 */
export const InvalidCredentials = 'InvalidCredentials';
/**
 * metric emitted when any error occurs
 */
export const AllErrors = 'AllErrors';
