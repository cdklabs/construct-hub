import { metricScope, Unit } from 'aws-embedded-metrics';
import type { Context } from 'aws-lambda';
import * as _AWS from 'aws-sdk';
import { CacheStrategy } from '../../caching';
import * as aws from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';
import { ENV_PACKAGE_DATA_BUCKET_NAME, ENV_PACKAGE_DATA_KEY_PREFIX, ENV_VERSION_TRACKER_BUCKET_NAME, ENV_VERSION_TRACKER_OBJECT_KEY, MetricName, METRICS_NAMESPACE } from './constants';

// Batch size that limits how many outgoing S3 calls are made at a time.
// This can be tweaked as needed (increased if we want to squeeze out more
// performance, or decreased if we are getting too throttled).
const BATCH_SIZE = 200;

export async function handler(event: any, context: Context) {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  const VERSION_TRACKER_BUCKET_NAME = requireEnv(ENV_VERSION_TRACKER_BUCKET_NAME);
  const VERSION_TRACKER_OBJECT_KEY = requireEnv(ENV_VERSION_TRACKER_OBJECT_KEY);

  const PACKAGE_DATA_BUCKET_NAME = requireEnv(ENV_PACKAGE_DATA_BUCKET_NAME);
  const PACKAGE_DATA_KEY_PREFIX = requireEnv(ENV_PACKAGE_DATA_KEY_PREFIX);

  const PACKAGE_PREFIX_REGEX = new RegExp('^' + PACKAGE_DATA_KEY_PREFIX + '((?:@[^/]+\/)?[^/]+)\/v([^/]+)\/$');

  // Gather a list of all package prefixes.
  const packagePrefixes: string[] = await listPackagePrefixes(PACKAGE_DATA_BUCKET_NAME, PACKAGE_DATA_KEY_PREFIX);

  // Collect the list of versions for each package in parallel,
  // batched as needed to limit network throughput.
  const requestBatches = groupIntoBatches(packagePrefixes, BATCH_SIZE);
  const versionMap: Map<string, string[]> = new Map();
  for (const [idx, batch] of requestBatches.entries()) {
    console.log(`Batch ${idx} of ${requestBatches.length}`);

    const promises = batch.map(async (packagePrefix) => {
      const versionPrefixes = await listPrefixes(PACKAGE_DATA_BUCKET_NAME, packagePrefix);
      if (versionPrefixes.length === 0) return;
      const [, name] = PACKAGE_PREFIX_REGEX.exec(versionPrefixes[0])!;
      const versions = new Array<string>();
      for (const versionPrefix of versionPrefixes) {
        const [,, version] = PACKAGE_PREFIX_REGEX.exec(versionPrefix)!;
        versions.push(version);
      }
      versionMap.set(name, versions);
    });

    await Promise.all(promises);
  }

  const versionJson = {
    packages: Object.fromEntries(versionMap),
    updatedAt: new Date().toISOString(),
  };

  let totalVersions = 0;
  versionMap.forEach((versions) => { totalVersions += versions.length; });

  // Update metrics.
  console.log(`${versionMap.size} package versions have been recorded.`);
  await metricScope((metrics) => async () => {
    // Clear out default dimensions as we don't need those. See https://github.com/awslabs/aws-embedded-metrics-node/issues/73
    metrics.setDimensions();

    metrics.setNamespace(METRICS_NAMESPACE);
    metrics.putMetric(MetricName.TRACKED_PACKAGES_COUNT, versionMap.size, Unit.Count);
    metrics.putMetric(MetricName.TRACKED_VERSIONS_COUNT, totalVersions, Unit.Count);
  })();

  // Upload the result to S3 and exit.
  const result = await aws.s3().putObject({
    Bucket: VERSION_TRACKER_BUCKET_NAME,
    Key: VERSION_TRACKER_OBJECT_KEY,
    Body: JSON.stringify(versionJson),
    ContentType: 'application/json',
    CacheControl: CacheStrategy.default().toString(),
    Metadata: {
      'Lambda-Log-Group': context.logGroupName,
      'Lambda-Log-Stream': context.logStreamName,
      'Lambda-Run-Id': context.awsRequestId,
      'Package-Count': `${versionMap.size}`,
      'Version-Count': `${totalVersions}`,
    },
  }).promise();

  return result;
}

/**
 * List all prefixes in a bucket given a base prefix.
 *
 * For example, if given "data/" it will return
 * [
 *   "data/@aws-amplify/",
 *   "data/@aws-c2a/",
 *   "data/@aws-cdk/",
 *   ...
 * ]
 */
async function listPrefixes(bucket: string, prefix: string): Promise<string[]> {
  const prefixes = new Array<string>();

  let continuationToken;
  do {
    const listRequest: AWS.S3.ListObjectsV2Request = {
      Bucket: bucket,
      Prefix: prefix,
      Delimiter: '/',
      ContinuationToken: continuationToken,
    };
    const listResponse = await aws.s3().listObjectsV2(listRequest).promise();
    continuationToken = listResponse.NextContinuationToken;

    for (const { Prefix: commonPrefix } of listResponse.CommonPrefixes ?? []) {
      if (!commonPrefix) { continue; }
      prefixes.push(commonPrefix);
    }

  } while (continuationToken);

  return prefixes;
}

/**
 * List all package prefixes in a bucket given a base prefix.
 *
 * For example, if given "data/" it will return
 * [
 *   "data/@aws-amplify/cdk-exported-backend",
 *   "data/@aws-c2a/cdk-pipelines-step",
 *   "data/@aws-cdk/alexa-ask",
 *   "data/@aws-cdk/app-delivery",
 *   "data/@aws-cdk/assertions",
 *   ...
 * ]
 */
async function listPackagePrefixes(bucket: string, prefix: string): Promise<string[]> {
  const packagePrefixes = new Array<string>();

  // gather a list of all package scopes and unscoped packages
  const initialPrefixes = await listPrefixes(bucket, prefix);
  const scopedPrefixes = initialPrefixes.filter((p) => p?.startsWith(`${prefix}@`));
  const unscopedPrefixes = initialPrefixes.filter((p) => !p?.startsWith(`${prefix}@`));

  // scoped packages need to be collected separately, so we
  // group the requests into batches, run them in parallel, and
  // flatten the results to an output list
  const batches = groupIntoBatches(scopedPrefixes, BATCH_SIZE);
  for (const batch of batches) {
    const promises: Promise<string[]>[] = batch.map(async (scopedPrefix) => listPrefixes(bucket, scopedPrefix));
    const results = await Promise.all(promises);
    packagePrefixes.push(...results.flat());
  }

  packagePrefixes.push(...unscopedPrefixes);

  return packagePrefixes;
}

/**
 * Partition an array into contiguous subsequences.
 */
function groupIntoBatches<T>(arr: readonly T[], batchSize: number): T[][] {
  const batches = [];
  for (let i = 0; i < arr.length; i += batchSize) {
    batches.push(arr.slice(i, i + batchSize));
  }
  return batches;
}
