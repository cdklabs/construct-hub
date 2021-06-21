/*
 * IMPORTANT: This file is used both by bundled lambda functions and by
 * constructs. This means it should not directly or transitively import anything
 * not part of the package's `dependencies`, such as the `aws-sdk`.
 */

import type { TargetLanguage } from 'jsii-rosetta';

/**
 * Key prefix for the package data storage.
 */
export const STORAGE_KEY_PREFIX = 'data/';

/**
 * Key suffix for storing npm package bundles.
 */
export const PACKAGE_KEY_SUFFIX = '/package.tgz';

/**
 * The key suffix for (TypeScript) assembly files
 */
export const ASSEMBLY_KEY_SUFFIX = '/assembly.json';

/**
 * The key suffix for assemblies in the provided language. This should NOT be
 * used for the TypeScript/JavaScript assembly however.
 */
export function assemblyKeySuffix(lang: TargetLanguage) {
  return `/assembly-${lang}.json`;
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
