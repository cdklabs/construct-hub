import { metricScope, Configuration, Unit } from 'aws-embedded-metrics';
import Environments from 'aws-embedded-metrics/lib/environment/Environments';
import type { Context, ScheduledEvent } from 'aws-lambda';
import { SemVer } from 'semver';
import * as aws from '../shared/aws.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { DocumentationLanguage } from '../shared/language';
import { METRICS_NAMESPACE, MetricName, LANGUAGE_DIMENSION } from './constants';

Configuration.environmentOverride = Environments.Lambda;
Configuration.namespace = METRICS_NAMESPACE;

export async function handler(event: ScheduledEvent, _context: Context) {
  console.log('Event:', JSON.stringify(event, null, 2));

  const indexedPackages = new Map<string, IndexedPackageStatus>();
  const packageNames = new Set<string>();
  const packageMajorVersions = new Set<string>();
  const perLanguage = new Map<DocumentationLanguage, PerLanguageData>();

  /**
   * Records the status of a particular package, package major version, package
   * version, and package version submodule in the per-language state storage.
   * Whenever a new entry is added, a `MISSING` entry is automatically inserted
   * for the other languages (unless another entry already exists).
   *
   * If a submodule is provided, only that submodule's availability is updated.
   */
  function recordPerLanguage(
    language: DocumentationLanguage,
    status: PerLanguageStatus,
    pkgName: string,
    pkgMajor: string,
    pkgVersion: string,
    submodule?: string,
  ) {
    for (const lang of DocumentationLanguage.ALL) {
      doRecordPerLanguage(
        perLanguage,
        lang,
        // If the language is NOT the registered one, then we insert "MISSING".
        lang === language ? status : PerLanguageStatus.MISSING,
        pkgName,
        pkgMajor,
        pkgVersion,
        submodule,
      );
    }
  }

  const bucket = requireEnv('BUCKET_NAME');
  for await (const key of relevantObjectKeys(bucket)) {
    const [, name, version] = constants.STORAGE_KEY_FORMAT_REGEX.exec(key)!;

    packageNames.add(name);
    const majorVersion = `${name}@${new SemVer(version).major}`;
    packageMajorVersions.add(majorVersion);

    const fullName = `${name}@${version}`;

    // Ensure the package is fully registered for per-language status, even if no doc exists yet.
    for (const language of DocumentationLanguage.ALL) {
      recordPerLanguage(language, PerLanguageStatus.MISSING, name, majorVersion, fullName);
    }

    if (!indexedPackages.has(fullName)) {
      indexedPackages.set(fullName, {});
    }
    const status = indexedPackages.get(fullName)!;

    if (key.endsWith(constants.METADATA_KEY_SUFFIX)) {
      status.metadataPresent = true;
    } else if (key.endsWith(constants.PACKAGE_KEY_SUFFIX)) {
      status.tarballPresent = true;
    } else if (key.endsWith(constants.ASSEMBLY_KEY_SUFFIX)) {
      status.assemblyPresent = true;
    } else {
      let identified = false;
      for (const language of DocumentationLanguage.ALL) {
        const match = submoduleKeyRegexp(language).exec(key);
        if (match != null) {
          const [, submodule, isUnsupported] = match;
          if (status.submodules == null) {
            status.submodules = new Set();
          }
          status.submodules.add(`${fullName}.${submodule}`);
          recordPerLanguage(
            language,
            isUnsupported ? PerLanguageStatus.UNSUPPORTED : PerLanguageStatus.SUPPORTED,
            name,
            majorVersion,
            fullName,
            submodule,
          );
          identified = true;
        } else if (key.endsWith(constants.docsKeySuffix(language))) {
          recordPerLanguage(language, PerLanguageStatus.SUPPORTED, name, majorVersion, fullName);
          identified = true;
        } else if (key.endsWith(constants.docsKeySuffix(language) + constants.NOT_SUPPORTED_SUFFIX)) {
          recordPerLanguage(language, PerLanguageStatus.SUPPORTED, name, majorVersion, fullName);
          identified = true;
        }
      }
      if (!identified) {
        status.unknownObjects = status.unknownObjects ?? [];
        status.unknownObjects.push(key);
      }
    }
  }

  await metricScope((metrics) => () => {
    // Clear out default dimensions as we don't need those. See https://github.com/awslabs/aws-embedded-metrics-node/issues/73.
    metrics.setDimensions();

    const missingMetadata = new Array<string>();
    const missingAssembly = new Array<string>();
    const missingTarball = new Array<string>();
    const unknownObjects = new Array<string>();
    const submodules = new Array<string>();
    for (const [name, status] of indexedPackages.entries()) {
      if (!status.metadataPresent) {
        missingMetadata.push(name);
      }
      if (!status.assemblyPresent) {
        missingAssembly.push(name);
      }
      if (!status.tarballPresent) {
        missingTarball.push(name);
      }
      if (status.unknownObjects?.length ?? 0 > 0) {
        unknownObjects.push(...status.unknownObjects!);
      }

      for (const submodule of status.submodules ?? []) {
        submodules.push(submodule);
      }
    }

    metrics.setProperty('detail', { missingMetadata, missingAssembly, missingTarball, unknownObjects });

    metrics.putMetric(MetricName.MISSING_METADATA_COUNT, missingMetadata.length, Unit.Count);
    metrics.putMetric(MetricName.MISSING_ASSEMBLY_COUNT, missingAssembly.length, Unit.Count);
    metrics.putMetric(MetricName.MISSING_TARBALL_COUNT, missingTarball.length, Unit.Count);
    metrics.putMetric(MetricName.PACKAGE_COUNT, packageNames.size, Unit.Count);
    metrics.putMetric(MetricName.PACKAGE_MAJOR_COUNT, packageMajorVersions.size, Unit.Count);
    metrics.putMetric(MetricName.PACKAGE_VERSION_COUNT, indexedPackages.size, Unit.Count);
    metrics.putMetric(MetricName.SUBMODULE_COUNT, submodules.length, Unit.Count);
    metrics.putMetric(MetricName.UNKNOWN_OBJECT_COUNT, unknownObjects.length, Unit.Count);
  })();

  for (const [language, data] of perLanguage.entries()) {
    await metricScope((metrics) => () => {
      metrics.setDimensions({ [LANGUAGE_DIMENSION]: language.toString() });

      metrics.putMetric(
        MetricName.PER_LANGUAGE_MISSING_PACKAGES,
        Array.from(data.packages.values()).filter((v) => v === PerLanguageStatus.MISSING).length,
        Unit.Count,
      );
      metrics.putMetric(
        MetricName.PER_LANGUAGE_MISSING_MAJORS,
        Array.from(data.packageMajors.values()).filter((v) => v === PerLanguageStatus.MISSING).length,
        Unit.Count,
      );
      metrics.putMetric(
        MetricName.PER_LANGUAGE_MISSING_VERSIONS,
        Array.from(data.packageVersions.values()).filter((v) => v === PerLanguageStatus.MISSING).length,
        Unit.Count,
      );
      metrics.putMetric(
        MetricName.PER_LANGUAGE_MISSING_SUBMODULES,
        Array.from(data.submodules.values()).filter((v) => v === PerLanguageStatus.MISSING).length,
        Unit.Count,
      );

      metrics.putMetric(
        MetricName.PER_LANGUAGE_SUPPORTED_PACKAGES,
        Array.from(data.packages.values()).filter((v) => v === PerLanguageStatus.SUPPORTED).length,
        Unit.Count,
      );
      metrics.putMetric(
        MetricName.PER_LANGUAGE_SUPPORTED_MAJORS,
        Array.from(data.packageMajors.values()).filter((v) => v === PerLanguageStatus.SUPPORTED).length,
        Unit.Count,
      );
      metrics.putMetric(
        MetricName.PER_LANGUAGE_SUPPORTED_VERSIONS,
        Array.from(data.packageVersions.values()).filter((v) => v === PerLanguageStatus.SUPPORTED).length,
        Unit.Count,
      );
      metrics.putMetric(
        MetricName.PER_LANGUAGE_SUPPORTED_SUBMODULES,
        Array.from(data.submodules.values()).filter((v) => v === PerLanguageStatus.SUPPORTED).length,
        Unit.Count,
      );

      metrics.putMetric(
        MetricName.PER_LANGUAGE_UNSUPPORTED_PACKAGES,
        Array.from(data.packages.values()).filter((v) => v === PerLanguageStatus.UNSUPPORTED).length,
        Unit.Count,
      );
      metrics.putMetric(
        MetricName.PER_LANGUAGE_UNSUPPORTED_MAJORS,
        Array.from(data.packageMajors.values()).filter((v) => v === PerLanguageStatus.UNSUPPORTED).length,
        Unit.Count,
      );
      metrics.putMetric(
        MetricName.PER_LANGUAGE_UNSUPPORTED_VERSIONS,
        Array.from(data.packageVersions.values()).filter((v) => v === PerLanguageStatus.UNSUPPORTED).length,
        Unit.Count,
      );
      metrics.putMetric(
        MetricName.PER_LANGUAGE_UNSUPPORTED_SUBMODULES,
        Array.from(data.submodules.values()).filter((v) => v === PerLanguageStatus.UNSUPPORTED).length,
        Unit.Count,
      );
    })();
  }
}

async function* relevantObjectKeys(bucket: string): AsyncGenerator<string, void, void> {
  const request: AWS.S3.ListObjectsV2Request = {
    Bucket: bucket,
    Prefix: constants.STORAGE_KEY_PREFIX,
  };
  do {
    const response = await aws.s3().listObjectsV2(request).promise();
    for (const { Key } of response.Contents ?? []) {
      if (Key == null) { continue; }
      yield Key;
    }
    request.ContinuationToken = response.NextContinuationToken;
  } while (request.ContinuationToken != null);
}

/**
 * This function obtains a regular expression with a capture group that allows
 * determining the submodule name from a submodule documentation key, and
 * another to determine whether the object is an "unsupported beacon" or not.
 */
function submoduleKeyRegexp(language: DocumentationLanguage): RegExp {
  // We use a placeholder to be able to insert the capture group once we have
  // fully quoted the key prefix for Regex safety.
  const placeholder = '<SUBMODULENAME>';

  // We obtain the standard key prefix.
  const keyPrefix = constants.docsKeySuffix(language, placeholder);

  // Finally, assemble the regular expression with the capture group.
  return new RegExp(`.*${reQuote(keyPrefix).replace(placeholder, '(.+)')}(${reQuote(constants.NOT_SUPPORTED_SUFFIX)})?$`);

  /**
   * Escapes all "speacial meaning" characters in a string, so it can be used as
   * part of a regular expression.
   */
  function reQuote(str: string): string {
    return str.replace(/([+*.()?$[\]])/g, '\\$1');
  }
}

interface IndexedPackageStatus {
  metadataPresent?: boolean;
  assemblyPresent?: boolean;
  submodules?: Set<string>;
  tarballPresent?: boolean;
  unknownObjects?: string[];
}

interface PerLanguageData {
  readonly packages: Map<string, PerLanguageStatus>;
  readonly packageMajors: Map<string, PerLanguageStatus>;
  readonly packageVersions: Map<string, PerLanguageStatus>;
  readonly submodules: Map<string, PerLanguageStatus>;
}

const enum PerLanguageStatus {
  MISSING,
  UNSUPPORTED,
  SUPPORTED,
}

/**
 * Registers the information for the provided language. A "MISSING" status
 * will be ignored if another status was already registered for the same
 * entity. An "UNSUPPORTED" status will be ignored if a "SUPPORTED" status
 * was already registered for the same entity.
 *
 * If a submodule is provided, only that submodule's availability is updated.
 */
function doRecordPerLanguage(
  perLanguage: Map<DocumentationLanguage, PerLanguageData>,
  language: DocumentationLanguage,
  status: PerLanguageStatus,
  pkgName: string,
  pkgMajor: string,
  pkgVersion: string,
  submodule?: string,
) {
  if (!perLanguage.has(language)) {
    perLanguage.set(language, {
      packageMajors: new Map(),
      packageVersions: new Map(),
      packages: new Map(),
      submodules: new Map(),
    });
  }
  const data = perLanguage.get(language)!;

  // If there is a submodule, only update the submodule domain.
  const outputDomains: readonly [Map<string, PerLanguageStatus>, string][] =
    submodule
    ? [
      [data.submodules, `${pkgVersion}.${submodule}`],
    ]
    : [
      [data.packageMajors, pkgMajor],
      [data.packageVersions, pkgVersion],
      [data.packages, pkgName],
    ];
  for (const [map, name] of outputDomains) {
    switch (status) {
      case PerLanguageStatus.MISSING:
        // If we already have a status, don't override it with "MISSING".
        if (!map.has(name)) {
          map.set(name, status);
        }
        break;
      case PerLanguageStatus.SUPPORTED:
        // If thr package is "supported", this always "wins"
        map.set(name, status);
        break;
      case PerLanguageStatus.UNSUPPORTED:
        // If we already have a status, only override with "UNSUPPORTED" if it was "MISSING".
        if (!map.has(name) || map.get(name) === PerLanguageStatus.MISSING) {
          map.set(name, status);
        }
        break;
    }
  }
}
