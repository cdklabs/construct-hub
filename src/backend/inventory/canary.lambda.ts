import { metricScope, Configuration, Unit } from 'aws-embedded-metrics';
import Environments from 'aws-embedded-metrics/lib/environment/Environments';
import type { Context, ScheduledEvent } from 'aws-lambda';
import { TargetLanguage } from 'jsii-rosetta';
import * as aws from '../shared/aws.lambda-shared';
import * as constants from '../shared/constants.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';
import { METRICS_NAMESPACE, MetricName } from './constants.lambda-shared';

Configuration.environmentOverride = Environments.Lambda;
Configuration.namespace = METRICS_NAMESPACE;

export async function handler(event: ScheduledEvent, _context: Context) {
  console.log('Event:', JSON.stringify(event, null, 2));

  const indexedPackages = new Map<string, IndexedPackageStatus>();

  const bucket = requireEnv('BUCKET_NAME');
  const timestamp = Date.now();

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
      status.originalAssemblyPresent = true;
    } else if (key.endsWith(constants.assemblyKeySuffix(TargetLanguage.PYTHON))) {
      status.pythonAssemblyPresent = true;
    } else {
      status.unknownObjects = status.unknownObjects ?? [];
      status.unknownObjects.push(key);
    }
  }

  for (const [name, status] of indexedPackages.entries()) {
    await metricScope((metrics) => () => {
      metrics.setDimensions();

      metrics.setTimestamp(timestamp);
      metrics.setProperty('PackageVersion', name);
      metrics.putMetric(MetricName.MISSING_METADATA_COUNT, status.metadataPresent ? 0 : 1, Unit.Count);
      metrics.putMetric(MetricName.MISSING_ORIGINAL_ASSEMBLY_COUNT, status.originalAssemblyPresent ? 0 : 1, Unit.Count);
      metrics.putMetric(MetricName.MISSING_PYTHON_ASSEMBLY_COUNT, status.pythonAssemblyPresent ? 0 : 1, Unit.Count);
      metrics.putMetric(MetricName.MISSING_TARBALL_COUNT, status.tarballPresent ? 0 : 1, Unit.Count);
      metrics.putMetric(MetricName.PACKAGE_VERSION_COUNT, 1, Unit.Count);

      if (status.unknownObjects != null) {
        metrics.setProperty('UnknownObjects', status.unknownObjects);
      }
      metrics.putMetric(MetricName.UNKNOWN_OBJECT_COUNT, status.unknownObjects?.length ?? 0, Unit.Count);
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

interface IndexedPackageStatus {
  metadataPresent?: boolean;
  originalAssemblyPresent?: boolean;
  pythonAssemblyPresent?: boolean;
  tarballPresent?: boolean;
  unknownObjects?: string[];
}
