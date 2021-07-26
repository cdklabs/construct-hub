/**
 * The name of an environment variable that contains the bucket name that includes the deny list.
 */
export const ENV_DENY_LIST_BUCKET_NAME = 'DENY_LIST_BUCKET_NAME';

/**
 * The object key of the deny list in the bucket.
 */
export const ENV_DENY_LIST_OBJECT_KEY = 'DENY_LIST_OBJECT_KEY';

export const ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME = 'PACKAGE_DATA_BUCKET_NAME';
export const ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX = 'PACKAGE_DATA_KEY_PREFIX';
export const ENV_PRUNE_QUEUE_URL = 'PRUNE_QUEUE_URL';

export const ENV_DELETE_OBJECT_DATA_BUCKET_NAME = 'PACKAGE_DATA_BUCKET_NAME';
export const ENV_DELETE_OBJECT_CATALOG_REBUILD_FUNCTION_NAME = 'CATALOG_REBUILD_FUNCTION_NAME';

export const METRICS_NAMESPACE = 'ConstructHub/DenyList';

export const enum MetricName {
  DENY_LIST_RULE_COUNT = 'DenyListRuleCount',
}
