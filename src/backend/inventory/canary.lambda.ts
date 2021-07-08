import { metricScope, Configuration, Unit } from 'aws-embedded-metrics';
import Environments from 'aws-embedded-metrics/lib/environment/Environments';
import type { Context, ScheduledEvent } from 'aws-lambda';
import * as aws from '../shared/aws.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { METRICS_NAMESPACE, MetricName } from './constants';

Configuration.environmentOverride = Environments.Lambda;
Configuration.namespace = METRICS_NAMESPACE;

export async function handler(event: ScheduledEvent, _context: Context) {
  console.log('Event:', JSON.stringify(event, null, 2));

  const indexedPackages = new Map<string, IndexedPackageStatus>();

  const bucket = requireEnv('BUCKET_NAME');
  for await (const key of relevantObjectKeys(bucket)) {
    const [, name, version] = constants.STORAGE_KEY_FORMAT_REGEX.exec(key)!;
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
    } else if (key.endsWith(constants.docsKeySuffix('python'))) {
      status.pythonDocsPresent = true;
    } else if (key.endsWith(constants.docsKeySuffix('ts'))) {
      status.tsDocsPresent = true;
    } else {
      status.unknownObjects = status.unknownObjects ?? [];
      status.unknownObjects.push(key);
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
    }

    metrics.setProperty('detail', { missingMetadata, missingOriginalAssembly: missingAssembly, missingPythonAssembly: missingPythonDocs, missingTarball, unknownObjects });

    metrics.putMetric(MetricName.MISSING_METADATA_COUNT, missingMetadata.length, Unit.Count);
    metrics.putMetric(MetricName.MISSING_ORIGINAL_ASSEMBLY_COUNT, missingAssembly.length, Unit.Count);
    metrics.putMetric(MetricName.MISSING_PYTHON_ASSEMBLY_COUNT, missingPythonDocs.length, Unit.Count);
    metrics.putMetric(MetricName.MISSING_TARBALL_COUNT, missingTarball.length, Unit.Count);
    metrics.putMetric(MetricName.PACKAGE_VERSION_COUNT, indexedPackages.size, Unit.Count);
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

interface IndexedPackageStatus {
  metadataPresent?: boolean;
  assemblyPresent?: boolean;
  pythonDocsPresent?: boolean;
  tsDocsPresent?: boolean;
  tarballPresent?: boolean;
  unknownObjects?: string[];
}
