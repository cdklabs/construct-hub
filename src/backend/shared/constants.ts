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
 * The key suffix release notes file
 */
export const PACKAGE_RELEASE_NOTES_KEY_SUFFIX = '/release-notes.md';

/**
 * The key suffix for a TypeScript doc artifact (root module).
 */
export const DOCS_KEY_SUFFIX_TYPESCRIPT = docsKeySuffix(
  DocumentationLanguage.TYPESCRIPT
);

/**
 * The key suffix for a Python doc artifact (root module).
 */
export const DOCS_KEY_SUFFIX_PYTHON = docsKeySuffix(
  DocumentationLanguage.PYTHON
);

/**
 * The key suffix for a Java doc artifact (root module).
 */
export const DOCS_KEY_SUFFIX_JAVA = docsKeySuffix(DocumentationLanguage.JAVA);

/**
 * The key suffix for a Dotnet doc artifact (root module).
 */
export const DOCS_KEY_SUFFIX_CSHARP = docsKeySuffix(
  DocumentationLanguage.CSHARP
);

/**
 * The key suffix for a Go doc artifact (root module).
 */
export const DOCS_KEY_SUFFIX_GO = docsKeySuffix(DocumentationLanguage.GO);

/**
 * The key suffix matching any documentation artifact.
 */
export const DOCS_KEY_SUFFIX_ANY = docsKeySuffix('*');

/**
 * Key for RSS document
 */
export const FEED_RSS_KEY = 'rss';

/**
 * Key for RSS document
 */
export const FEED_ATOM_KEY = 'atom';

/**
 * Key for badge image endpoint.
 */
export const BADGE_KEY = 'badge';

/**
 * Env variable name used to set construct hub url for RSS/ATOM feed
 */
export const CONSTRUCT_HUB_URL_ENV_VAR_NAME = 'CONSTRUCT_HUB_URL';

export const CONSTRUCT_HUB_FEED_TITLE = 'CONSTRUCT_HUB_FEED_TITLE';

export const CONSTRUCT_HUB_FEED_DESCRIPTION = 'CONSTRUCT_HUB_FEED_DESCRIPTION';

/**
 * Return the S3 object key prefix for a specific package name and optionally a
 * version. Note that the prefix does not end with a "/" so you will likely want
 * to add that if you want to match a specific set of objects.
 */
export function getObjectKeyPrefix(
  packageName: string,
  packageVersion?: string
) {
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
    releaseNotesKey: `${prefix}${PACKAGE_RELEASE_NOTES_KEY_SUFFIX}`,
  };
}

/**
 * The key suffix for documentation artifacts by language and submodule.
 *
 * SubmoduleFqn can cleverly be '*' which means "all submodules".
 */
export function docsKeySuffix(
  lang?: DocumentationLanguage | '*',
  submoduleFqn?: string,
  fileExt?: string
) {
  // We strip the first part (assembly name) off of the submodule name, but
  // only if it's not '*' or '<SUBMODULENAME>'
  const submodule =
    submoduleFqn && submoduleFqn !== '*' && submoduleFqn !== '<SUBMODULENAME>'
      ? submoduleFqn.split('.').slice(1).join('.')
      : submoduleFqn;

  return `/docs-${submodule ? `${submodule}-` : ''}${lang}.${fileExt ?? '*'}`;
}

/**
 * The key suffix for a corrupted assembly marker by language and submodule.
 */
export function corruptAssemblyKeySuffix(
  lang?: DocumentationLanguage | '*',
  submodule?: string,
  fileExt?: string
) {
  return `${docsKeySuffix(lang, submodule, fileExt)}${CORRUPT_ASSEMBLY_SUFFIX}`;
}

/**
 * The key suffix for a not supported marker by language and submodule.
 */
export function notSupportedKeySuffix(
  lang?: DocumentationLanguage | '*',
  submodule?: string,
  fileExt?: string
) {
  return `${docsKeySuffix(lang, submodule, fileExt)}${NOT_SUPPORTED_SUFFIX}`;
}

/**
 * The key suffix for a not supported marker by language and submodule.
 */
export function transliterationErrorKeySuffix(
  lang?: DocumentationLanguage | '*'
) {
  return `${docsKeySuffix(lang)}${TRANSLITERATION_ERROR}`;
}

/**
 * Key suffix for beacon files when a particular feature is not supported for
 * the particular package (i.e: Python docs for a package that does not have a
 * Python target configured).
 */
export const NOT_SUPPORTED_SUFFIX = '.not-supported';

/**
 * Key suffix for beacon files marking that a language specific assembly is corrupt
 * and we cannot generate docs from it.
 */
export const CORRUPT_ASSEMBLY_SUFFIX = '.corruptassembly';

/**
 * Key suffix for beacon files when the transliteration for a particular language
 * target has failed for a package.
 */
export const TRANSLITERATION_ERROR = '.transliteration-failed';

/**
 * Key suffix for a beacon file when a package cannot be installed.
 */
export const UNINSTALLABLE_PACKAGE_SUFFIX = '/uninstallable';

/**
 * Name of the error denoting an unprocessable package that should be diverted away from the DLQ.
 */
export const UNPROCESSABLE_PACKAGE_ERROR_NAME = 'UnprocessablePackageError';

/**
 * The key for the catalog document.
 */
export const CATALOG_KEY = 'catalog.json';

/** Key for feed metadata document*/
export const FEED_METADATA_KEY = 'feed-metadata.json';

/**
 * The key for the version tracking document.
 */
export const VERSION_TRACKER_KEY = 'all-versions.json';

/**
 * The key for missing documentation report.
 *
 * @param language the language for which missing documentation is requested.
 */
export function missingDocumentationReport(
  language: DocumentationLanguage
): string {
  return `missing-objects/${language.name}-documentation.json`;
}

/**
 * The key for corrupt assembly report.
 *
 * @param language the language for which the report is requested.
 */
export function corruptAssemblyReport(language: DocumentationLanguage): string {
  return `corruptassembly-objects/${language.name}.json`;
}

/**
 * The key for uninstallable packages report.
 */
export const UNINSTALLABLE_PACKAGES_REPORT = 'uninstallable-objects/data.json';

/**
 * The key pattern for objects containing missing documentation lists.
 */
export const MISSING_DOCUMENTATION_REPORT_PATTERN =
  'missing-objects/*-documentation.json';

/**
 * The key pattern for objects containing unprocessable assembly lists.
 */
export const CORRUPT_ASSEMBLY_REPORT_PATTERN = 'corruptassembly-objects/*.json';

/**
 * A regular expression that can be used to parse out a storage key.
 */
export const STORAGE_KEY_FORMAT_REGEX = new RegExp(
  `^${STORAGE_KEY_PREFIX}((?:@[^/]+/)?[^/]+)/v([^/]+)/.*$`
);
// Capture groups:                                                        ┗━━━━━━━━1━━━━━━━━┛  ┗━━2━━┛
