export const METRICS_NAMESPACE = 'ConstructHub/PackageSource/CodeArtifact';

export const DOMAIN_OWNER_DIMENSION = 'DomainOwner';
export const DOMAIN_NAME_DIMENSION = 'DomainName';
export const REPOSITORY_NAME_DIMENSION = 'RepositoryName';

export const enum MetricName {
  DELETED_COUNT = 'DeletedCount',
  DENY_LISTED_COUNT = 'DenyListedCount',
  INELIGIBLE_LICENSE = 'IneligibleLicenseCount',
  NOT_JSII_ENABLED_COUNT = 'NotJsiiEnabledCount',
}
