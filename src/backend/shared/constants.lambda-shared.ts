/*
 * IMPORTANT: This file is used both by bundled lambda functions and by
 * constructs. This means it should not directly or transitively import anything
 * not part of the package's `dependencies`, such as the `aws-sdk`.
 */

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
 * The key suffix for documentation artifacts in a specific target language.
 */
export function docsKeySuffix(lang: string, submodule?: string) {
  return `/docs-${submodule ? `${submodule}-` : ''}${lang}.md`;
}

/**
 * The key for the catalog document.
 */
export const CATALOG_KEY = 'catalog.json';

/**
 * Key prefix used by the built-in discovery function to store failed records.
 */
export const FAILED_KEY_PREFIX = 'failed/';

/**
 * Key prefix used by the built-in discovery function to stage tarballs.
 */
export const STAGED_KEY_PREFIX = 'staged/';
