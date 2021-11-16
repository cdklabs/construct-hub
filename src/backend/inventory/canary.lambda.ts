import { metricScope, Configuration, Unit } from 'aws-embedded-metrics';
import type { Context, ScheduledEvent } from 'aws-lambda';
import { PromiseResult } from 'aws-sdk/lib/request';
import { SemVer } from 'semver';
import * as aws from '../shared/aws.lambda-shared';
import { compressContent } from '../shared/compress-content.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { DocumentationLanguage } from '../shared/language';
import { METRICS_NAMESPACE, MetricName, LANGUAGE_DIMENSION } from './constants';

Configuration.namespace = METRICS_NAMESPACE;

export async function handler(event: ScheduledEvent, context: Context) {
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

    console.log(key);

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
    } else if (key.endsWith(constants.UNINSTALLABLE_PACKAGE_SUFFIX)) {
      status.uninstallable = true;
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
          recordPerLanguage(language, PerLanguageStatus.UNSUPPORTED, name, majorVersion, fullName);
          identified = true;
        } else if (key.endsWith(constants.docsKeySuffix(language) + constants.CORRUPT_ASSEMBLY_SUFFIX)) {
          recordPerLanguage(language, PerLanguageStatus.CORRUPT_ASSEMBLY, name, majorVersion, fullName);
          identified = true;
        }
      }
      if (!identified) {
        status.unknownObjects = status.unknownObjects ?? [];
        status.unknownObjects.push(key);
      }
    }
  }

  const reports: Promise<PromiseResult<AWS.S3.PutObjectOutput, AWS.AWSError>>[] = [];

  function createReport(reportKey: string, packageVersions: string[]) {

    const report = JSON.stringify(packageVersions, null, 2);
    const { buffer, contentEncoding } = compressContent(Buffer.from(report));
    console.log(`Uploading list to s3://${bucket}/${reportKey}`);
    reports.push(aws.s3().putObject({
      Body: buffer,
      Bucket: bucket,
      ContentEncoding: contentEncoding,
      ContentType: 'application/json',
      Expires: new Date(Date.now() + 300_000), // 5 minutes from now
      Key: reportKey,
      Metadata: {
        'Lambda-Run-Id': context.awsRequestId,
        'Lambda-Log-Group-Name': context.logGroupName,
        'Lambda-Log-Stream-Name': context.logStreamName,
      },
    }).promise());

  }

  await metricScope((metrics) => () => {
    // Clear out default dimensions as we don't need those. See https://github.com/awslabs/aws-embedded-metrics-node/issues/73.
    metrics.setDimensions();

    const missingMetadata = new Array<string>();
    const missingAssembly = new Array<string>();
    const missingTarball = new Array<string>();
    const uninstallable = new Array<string>();
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
      if (status.uninstallable) {
        uninstallable.push(name);
      }
      if (status.unknownObjects?.length ?? 0 > 0) {
        unknownObjects.push(...status.unknownObjects!);
      }

      for (const submodule of status.submodules ?? []) {
        submodules.push(submodule);
      }
    }

    metrics.setProperty('detail', { missingMetadata, missingAssembly, missingTarball, unknownObjects });

    metrics.putMetric(MetricName.UNINSTALLABLE_PACKAGE_COUNT, uninstallable.length, Unit.Count);
    metrics.putMetric(MetricName.MISSING_METADATA_COUNT, missingMetadata.length, Unit.Count);
    metrics.putMetric(MetricName.MISSING_ASSEMBLY_COUNT, missingAssembly.length, Unit.Count);
    metrics.putMetric(MetricName.MISSING_TARBALL_COUNT, missingTarball.length, Unit.Count);
    metrics.putMetric(MetricName.PACKAGE_COUNT, packageNames.size, Unit.Count);
    metrics.putMetric(MetricName.PACKAGE_MAJOR_COUNT, packageMajorVersions.size, Unit.Count);
    metrics.putMetric(MetricName.PACKAGE_VERSION_COUNT, indexedPackages.size, Unit.Count);
    metrics.putMetric(MetricName.SUBMODULE_COUNT, submodules.length, Unit.Count);
    metrics.putMetric(MetricName.UNKNOWN_OBJECT_COUNT, unknownObjects.length, Unit.Count);

    createReport(constants.UNINSTALLABLE_PACKAGES_REPORT, uninstallable);

  })();

  for (const entry of Array.from(perLanguage.entries())) {
    await metricScope((metrics) => async (language: DocumentationLanguage, data: PerLanguageData) => {
      console.log( '');
      console.log('##################################################');
      console.log(`### Start of data for ${language}`);

      metrics.setDimensions({ [LANGUAGE_DIMENSION]: language.toString() });

      for (const forStatus of [
        PerLanguageStatus.SUPPORTED,
        PerLanguageStatus.UNSUPPORTED,
        PerLanguageStatus.MISSING,
        PerLanguageStatus.CORRUPT_ASSEMBLY,
      ]) {
        for (const [key, statuses] of Object.entries(data)) {
          let filtered = Array.from(statuses.entries()).filter(([, status]) => forStatus === status);
          let metricName = METRIC_NAME_BY_STATUS_AND_GRAIN[forStatus as PerLanguageStatus][key as keyof PerLanguageData];

          if ((forStatus === PerLanguageStatus.MISSING && metricName === MetricName.PER_LANGUAGE_MISSING_VERSIONS)
           || (forStatus === PerLanguageStatus.CORRUPT_ASSEMBLY && metricName === MetricName.PER_LANGUAGE_CORRUPT_ASSEMBLY_VERSIONS)) {
            // generate reports for missing/corrupt only for package versions granularity
            const reportKey = forStatus === PerLanguageStatus.MISSING ?
              constants.missingDocumentationReport(language) :
              constants.corruptAssemblyReport(language);
            createReport(reportKey, filtered.map(([name]) => name).sort());
          }

          console.log(`${forStatus} ${key} for ${language}: ${filtered.length} entries`);
          metrics.putMetric(metricName, filtered.length, Unit.Count);
        }
      }

      console.log(`### End of data for ${language}`);
      console.log('##################################################');
      console.log('');
    })(...entry);
  }

  for (const report of reports) {
    await report;
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
  uninstallable?: boolean;
  submodules?: Set<string>;
  tarballPresent?: boolean;
  unknownObjects?: string[];
}

const enum Grain {
  PACKAGE_MAJOR_VERSIONS = 'package major versions',
  PACKAGE_VERSION_SUBMODULES = 'package version submodules',
  PACKAGE_VERSIONS = 'package versions',
  PACKAGES = 'packages',
}

type PerLanguageData = { readonly [grain in Grain]: Map<string, PerLanguageStatus> };

const enum PerLanguageStatus {
  MISSING = 'Missing',
  UNSUPPORTED = 'Unsupported',
  CORRUPT_ASSEMBLY = 'CorruptAssembly',
  SUPPORTED = 'Supported',
}

const METRIC_NAME_BY_STATUS_AND_GRAIN: { readonly [status in PerLanguageStatus]: { readonly [grain in Grain]: MetricName } } = {
  [PerLanguageStatus.MISSING]: {
    [Grain.PACKAGES]: MetricName.PER_LANGUAGE_MISSING_PACKAGES,
    [Grain.PACKAGE_MAJOR_VERSIONS]: MetricName.PER_LANGUAGE_MISSING_MAJORS,
    [Grain.PACKAGE_VERSIONS]: MetricName.PER_LANGUAGE_MISSING_VERSIONS,
    [Grain.PACKAGE_VERSION_SUBMODULES]: MetricName.PER_LANGUAGE_MISSING_SUBMODULES,
  },
  [PerLanguageStatus.UNSUPPORTED]: {
    [Grain.PACKAGES]: MetricName.PER_LANGUAGE_UNSUPPORTED_PACKAGES,
    [Grain.PACKAGE_MAJOR_VERSIONS]: MetricName.PER_LANGUAGE_UNSUPPORTED_MAJORS,
    [Grain.PACKAGE_VERSIONS]: MetricName.PER_LANGUAGE_UNSUPPORTED_VERSIONS,
    [Grain.PACKAGE_VERSION_SUBMODULES]: MetricName.PER_LANGUAGE_UNSUPPORTED_SUBMODULES,
  },
  [PerLanguageStatus.SUPPORTED]: {
    [Grain.PACKAGES]: MetricName.PER_LANGUAGE_SUPPORTED_PACKAGES,
    [Grain.PACKAGE_MAJOR_VERSIONS]: MetricName.PER_LANGUAGE_SUPPORTED_MAJORS,
    [Grain.PACKAGE_VERSIONS]: MetricName.PER_LANGUAGE_SUPPORTED_VERSIONS,
    [Grain.PACKAGE_VERSION_SUBMODULES]: MetricName.PER_LANGUAGE_SUPPORTED_SUBMODULES,
  },
  [PerLanguageStatus.CORRUPT_ASSEMBLY]: {
    [Grain.PACKAGES]: MetricName.PER_LANGUAGE_CORRUPT_ASSEMBLY_PACKAGES,
    [Grain.PACKAGE_MAJOR_VERSIONS]: MetricName.PER_LANGUAGE_CORRUPT_ASSEMBLY_MAJORS,
    [Grain.PACKAGE_VERSIONS]: MetricName.PER_LANGUAGE_CORRUPT_ASSEMBLY_VERSIONS,
    [Grain.PACKAGE_VERSION_SUBMODULES]: MetricName.PER_LANGUAGE_CORRUPT_ASSEMBLY_SUBMODULES,
  },
};


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
      [Grain.PACKAGE_MAJOR_VERSIONS]: new Map(),
      [Grain.PACKAGES]: new Map(),
      [Grain.PACKAGE_VERSION_SUBMODULES]: new Map(),
      [Grain.PACKAGE_VERSIONS]: new Map(),
    });
  }
  const data = perLanguage.get(language)!;

  // If there is a submodule, only update the submodule domain.
  const outputDomains: readonly [Map<string, PerLanguageStatus>, string][] =
    submodule
      ? [
        [data[Grain.PACKAGE_VERSION_SUBMODULES], `${pkgVersion}.${submodule}`],
      ]
      : [
        [data[Grain.PACKAGE_MAJOR_VERSIONS], pkgMajor],
        [data[Grain.PACKAGE_VERSIONS], pkgVersion],
        [data[Grain.PACKAGES], pkgName],
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
      case PerLanguageStatus.CORRUPT_ASSEMBLY:
        // If we already have a status, only override with if it was "MISSING".
        if (!map.has(name) || map.get(name) === PerLanguageStatus.MISSING) {
          map.set(name, status);
        }
        break;
    }
  }
}
