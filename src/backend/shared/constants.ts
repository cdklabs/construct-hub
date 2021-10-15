/*
 * IMPORTANT: This file is used both by bundled lambda functions and by
 * constructs. This means it should not directly or transitively import anything
 * not part of the package's `dependencies`, such as the `aws-sdk`.
 */

import { DocumentationLanguage } from './language';

/**
 * Key prefix for the package data storage.
 */
export const STORAGE_KEY_PREFIX = 'data/';

/**
 * Key suffix for storing npm package bundles.
 */
export const PACKAGE_KEY_SUFFIX = '/package.tgz';

/**
 * Key suffix for storing npm package metadata.
 */
export const METADATA_KEY_SUFFIX = '/metadata.json';

/**
 * The key suffix for (TypeScript) assembly files
 */
export const ASSEMBLY_KEY_SUFFIX = '/assembly.json';

/**
 * The key suffix for a TypeScript doc artifact (root module).
 */
export const DOCS_KEY_SUFFIX_TYPESCRIPT = docsKeySuffix(DocumentationLanguage.TYPESCRIPT);

/**
 * The key suffix for a Python doc artifact (root module).
 */
export const DOCS_KEY_SUFFIX_PYTHON = docsKeySuffix(DocumentationLanguage.PYTHON);

/**
 * The key suffix for a Python doc artifact (root module).
 */
export const DOCS_KEY_SUFFIX_JAVA = docsKeySuffix(DocumentationLanguage.JAVA);

/**
 * The key suffix matching any documentation artifact.
 */
export const DOCS_KEY_SUFFIX_ANY = docsKeySuffix('*');

/**
 * Return the S3 object key prefix for a specific package name and optionally a
 * version. Note that the prefix does not end with a "/" so you will likely want
 * to add that if you want to match a specific set of objects.
 */
export function getObjectKeyPrefix(packageName: string, packageVersion?: string) {
  let key = `${STORAGE_KEY_PREFIX}${packageName}`;
  if (packageVersion) {
    key += `/v${packageVersion}`;
  }

  return key;
}

/**
 * Resolves the set of S3 object keys use for a specific package/version.
 */
export function getObjectKeys(packageName: string, packageVersion: string) {
  const prefix = getObjectKeyPrefix(packageName, packageVersion);
  return {
    assemblyKey: `${prefix}${ASSEMBLY_KEY_SUFFIX}`,
    packageKey: `${prefix}${PACKAGE_KEY_SUFFIX}`,
    metadataKey: `${prefix}${METADATA_KEY_SUFFIX}`,
  };
}

/**
 * The key suffix for documentation artifacts by language and submodule.
 */
export function docsKeySuffix(lang?: DocumentationLanguage | '*', submodule?: string) {
  return `/docs-${submodule ? `${submodule}-` : ''}${lang}.md`;
}

/**
 * Key suffix for beacon files when a particular feature is not supported for
 * the particular package (i.e: Python docs for a package that does not have a
 * Python target configured).
 */
export const NOT_SUPPORTED_SUFFIX = '.not-supported';

/**
 * The key for the catalog document.
 */
export const CATALOG_KEY = 'catalog.json';

/**
 * A regular expression that can be used to parse out a storage key.
 */
export const STORAGE_KEY_FORMAT_REGEX = new RegExp(`^${STORAGE_KEY_PREFIX}((?:@[^/]+/)?[^/]+)/v([^/]+)/.*$`);
// Capture groups:                                                        ┗━━━━━━━━1━━━━━━━━┛  ┗━━2━━┛
