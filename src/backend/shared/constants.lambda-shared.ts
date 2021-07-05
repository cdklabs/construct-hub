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
 * Key suffix for storing npm package metadata.
 */
export const METADATA_KEY_SUFFIX = '/metadata.json';

/**
 * The key suffix for (TypeScript) assembly files
 */
export const ASSEMBLY_KEY_SUFFIX = '/assembly.json';

/**
 * The key suffix for assemblies in the provided language. This should NOT be
 * used for the TypeScript/JavaScript assembly however.
 */
export function assemblyKeySuffix(lang: TargetLanguage | '*') {
  return `/assembly-${lang}.json`;
}

/**
 * The key for the catalog document.
 */
export const CATALOG_KEY = 'catalog.json';

/**
 * A list of case-normalized (upper) SPDX license identifiers that are deemed
 * eligible for listing on the Construct Hub.
 *
 * @see https://github.com/cdklabs/construct-hub/issues/145
 */
export const ELIGIBLE_LICENSES: ReadonlySet<string> = new Set([
  // Apache Licenses
  'Apache-1.0',
  'Apache-1.1',
  'Apache-2.0',
  // BSD Licenses
  '0BSD',
  'BSD-1-Clause',
  'BSD-2-Clause',
  'BSD-2-Clause-Patent',
  'BSD-2-Clause-Views',
  'BSD-3-Clause',
  'BSD-3-Clause-Attribution',
  'BSD-3-Clause-Clear',
  'BSD-3-Clause-LBNL',
  'BSD-3-Clause-Modification',
  'BSD-3-Clause-No-Military-License',
  'BSD-3-Clause-No-Nuclear-License',
  'BSD-3-Clause-No-Nuclear-License-2014',
  'BSD-3-Clause-No-Nuclear-Warranty',
  'BSD-3-Clause-Open-MPI',
  'BSD-4-Clause',
  'BSD-4-Clause-Shortened',
  'BSD-4-Clause-UC',
  'BSD-Protection',
  'BSD-Source-Code',
  // MIT Licenses
  'MIT',
  'MIT-0',
  'MIT-advertising',
  'MIT-CMU',
  'MIT-enna',
  'MIT-feh',
  'MIT-Modern-Variant',
  'MIT-open-group',
  'MITNFA',
].map((s) => s.toUpperCase()));
