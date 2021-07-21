import { metricScope, Configuration, Unit } from 'aws-embedded-metrics';
import Environments from 'aws-embedded-metrics/lib/environment/Environments';
import type { Context, ScheduledEvent } from 'aws-lambda';
import { SemVer } from 'semver';
import * as aws from '../shared/aws.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { DocumentationLanguage } from '../shared/language';
import { METRICS_NAMESPACE, MetricName } from './constants';

Configuration.environmentOverride = Environments.Lambda;
Configuration.namespace = METRICS_NAMESPACE;

export async function handler(event: ScheduledEvent, _context: Context) {
  console.log('Event:', JSON.stringify(event, null, 2));

  const indexedPackages = new Map<string, IndexedPackageStatus>();
  const packageNames = new Set<string>();
  const packageMajorVersions = new Set<string>();

  const submoduleRegexes: Record<keyof SubmoduleStatus, RegExp> = {
    tsDocsPresent: submoduleKeyRegexp(DocumentationLanguage.TYPESCRIPT),
    pythonDocsPresent: submoduleKeyRegexp(DocumentationLanguage.PYTHON),
  };

  const bucket = requireEnv('BUCKET_NAME');
  for await (const key of relevantObjectKeys(bucket)) {
    const [, name, version] = constants.STORAGE_KEY_FORMAT_REGEX.exec(key)!;

    packageNames.add(name);
    packageMajorVersions.add(`${name}@${new SemVer(version).major}`);

    const fullName = `${name}@${version}`;
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
    } else if (key.endsWith(constants.DOCS_KEY_SUFFIX_PYTHON) ||
      key.endsWith(constants.DOCS_KEY_SUFFIX_PYTHON + constants.NOT_SUPPORTED_SUFFIX)) {
      status.pythonDocsPresent = true;
    } else if (key.endsWith(constants.DOCS_KEY_SUFFIX_TYPESCRIPT) ||
      key.endsWith(constants.DOCS_KEY_SUFFIX_TYPESCRIPT + constants.NOT_SUPPORTED_SUFFIX)) {
      status.tsDocsPresent = true;
    } else {
      // If this is a submodule-doc key, add the relevant nested status entry.
      const matching = Object.entries(submoduleRegexes)
        .map(([statusKey, regexp]) => {
          const match = regexp.exec(key);
          if (match == null) {
            return undefined;
          }
          return [statusKey, match[1]] as [keyof SubmoduleStatus, string];
        })
        .find((item) => item != null);
      if (matching) {
        const [statusKey, submoduleName] = matching;
        const submoduleFqn = `${fullName}.${submoduleName}`;
        if (status.submodules == null) {
          status.submodules = {};
        }
        if (status.submodules[submoduleFqn] == null) {
          status.submodules[submoduleFqn] = {};
        }
        status.submodules[submoduleFqn][statusKey] = true;
      } else {
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
    const missingPythonDocs = new Array<string>();
    const missingTsDocs = new Array<string>();
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
      if (!status.pythonDocsPresent) {
        missingPythonDocs.push(name);
      }
      if (!status.tsDocsPresent) {
        missingTsDocs.push(name);
      }
      if (!status.tarballPresent) {
        missingTarball.push(name);
      }
      if (status.unknownObjects?.length ?? 0 > 0) {
        unknownObjects.push(...status.unknownObjects!);
      }

      for (const [submodule, subStatus] of Object.entries(status.submodules ?? {})) {
        submodules.push(submodule);
        if (!subStatus.tsDocsPresent) {
          missingTsDocs.push(submodule);
        }
        if (!subStatus.pythonDocsPresent) {
          missingPythonDocs.push(submodule);
        }
      }
    }

    metrics.setProperty('detail', { missingMetadata, missingAssembly, missingPythonDocs, missingTsDocs, missingTarball, unknownObjects });

    metrics.putMetric(MetricName.MISSING_METADATA_COUNT, missingMetadata.length, Unit.Count);
    metrics.putMetric(MetricName.MISSING_ASSEMBLY_COUNT, missingAssembly.length, Unit.Count);
    metrics.putMetric(MetricName.MISSING_PYTHON_DOCS_COUNT, missingPythonDocs.length, Unit.Count);
    metrics.putMetric(MetricName.MISSING_TYPESCRIPT_DOCS_COUNT, missingTsDocs.length, Unit.Count);
    metrics.putMetric(MetricName.MISSING_TARBALL_COUNT, missingTarball.length, Unit.Count);
    metrics.putMetric(MetricName.PACKAGE_COUNT, packageNames.size, Unit.Count);
    metrics.putMetric(MetricName.PACKAGE_MAJOR_COUNT, packageMajorVersions.size, Unit.Count);
    metrics.putMetric(MetricName.PACKAGE_VERSION_COUNT, indexedPackages.size, Unit.Count);
    metrics.putMetric(MetricName.SUBMODULE_COUNT, submodules.length, Unit.Count);
    metrics.putMetric(MetricName.UNKNOWN_OBJECT_COUNT, unknownObjects.length, Unit.Count);
  })();
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
 * This function obtains a regular expression with a single capture group that
 * allows determining the submodule name from a submodule documentation key.
 */
function submoduleKeyRegexp(language: DocumentationLanguage): RegExp {
  // We use a placeholder to be able to insert the capture group once we have
  // fully quoted the key prefix for Regex safety.
  const placeholder = '<SUBMODULENAME>';

  // We obtain the standard key prefix.
  const keyPrefix = constants.docsKeySuffix(language, placeholder);
  // Make it regex-safe by quoting all "special meaning" characters.
  const regexpQuoted = keyPrefix.replace(/([+*.()?$[\]])/g, '\\$1');

  // Finally, assemble the regular expression with the capture group.
  return new RegExp(`.*${regexpQuoted.replace(placeholder, '(.+)')}$`);
}

interface IndexedPackageStatus {
  metadataPresent?: boolean;
  assemblyPresent?: boolean;
  pythonDocsPresent?: boolean;
  submodules?: { [name: string]: SubmoduleStatus };
  tsDocsPresent?: boolean;
  tarballPresent?: boolean;
  unknownObjects?: string[];
}

interface SubmoduleStatus {
  pythonDocsPresent?: boolean;
  tsDocsPresent?: boolean;
}
