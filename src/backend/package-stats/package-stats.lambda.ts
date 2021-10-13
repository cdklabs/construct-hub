import { metricScope, Unit } from 'aws-embedded-metrics';
import type { Context } from 'aws-lambda';
import type { AWSError, S3 } from 'aws-sdk';
import got from 'got';
import { CatalogModel } from '../catalog-builder';
import * as aws from '../shared/aws.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { NpmDownloadsClient, NpmDownloadsEntry, NpmDownloadsPeriod } from './npm-downloads.lambda-shared';

const METRICS_NAMESPACE = 'ConstructHub/PackageStats';

/**
 * Rebuilds the `stats.json` object in the configured S3 bucket.
 * Validates that the number of packages on a full rebuild should not decrease
 * significantly (due to network errors from e.g. NPM) - can be ignored
 * by passing { ignoreValidation: true }.
 *
 * @param event configuration for the rebuild job.
 * @param context the lambda context in which this execution runs.
 *
 * @returns the information about the updated S3 object.
 */
export async function handler(event: any, context: Context) {
  console.log(JSON.stringify(event, null, 2));

  const BUCKET_NAME = requireEnv('BUCKET_NAME');

  console.log('Loading the catalog...');
  const catalogData: AWS.S3.GetObjectOutput | undefined = await aws.s3()
    .getObject({ Bucket: BUCKET_NAME, Key: constants.CATALOG_KEY }).promise()
    .catch((err: AWSError) => err.code !== 'NoSuchKey'
      ? Promise.reject(err)
      : Promise.resolve({ /* no data */ } as S3.GetObjectOutput));

  if (!catalogData?.Body) {
    console.log('No catalog data found, so skipping all package stats operations.');
    return;
  }

  let stats: DeepWriteable<PackageStatsOutput>;
  const currentDate = new Date().toISOString();

  const oldStats: PackageStatsOutput = await fetchCurrentStatsObject(BUCKET_NAME) ?? { packages: {}, updated: currentDate };
  const oldStatsCount = Object.keys(oldStats.packages).length;

  const npmClient = new NpmDownloadsClient(got);
  const catalog: CatalogModel = JSON.parse(catalogData.Body.toString('utf-8'));
  const defaultStats: PackageStatsOutput = { packages: {}, updated: currentDate };

  let packageNames = catalog.packages.map(pkg => pkg.name);
  packageNames = [...new Set(packageNames).values()];

  stats = defaultStats;

  console.log(`Retrieving download stats for all registered pacakges: [${packageNames.join(',')}].`);
  const npmDownloads = await npmClient.getDownloads(packageNames, {
    period: NpmDownloadsPeriod.LAST_WEEK,
    throwErrors: false,
  });

  for (const [pkgName, entry] of npmDownloads.entries()) {
    updateStats(stats, pkgName, entry);
  }

  stats.updated = currentDate;

  // Update metrics
  const newStatsCount = Object.keys(stats.packages).length;
  const ignoreValidation = event.ignoreValidation ?? false;
  if (!ignoreValidation && newStatsCount < oldStatsCount) {
    throw new Error(`Number of recorded packages with download stats has decreased from ${oldStatsCount} to ${newStatsCount}. If this is expected, rerun with "ignoreValidation: true".`);
  }

  console.log(`There are now ${Object.keys(stats.packages).length} packages with NPM stats stored.`);
  await metricScope((metrics) => async () => {
    metrics.setNamespace(METRICS_NAMESPACE);
    metrics.putMetric('RegisteredPackages', catalog.packages.length, Unit.Count);
  })();

  // Upload the result to S3 and exit.
  return aws.s3().putObject({
    Bucket: BUCKET_NAME,
    Key: constants.STATS_KEY,
    Body: JSON.stringify(stats, null, 2),
    ContentType: 'application/json',
    CacheControl: 'public, max-age=300', // Expire from cache after 5 minutes
    Metadata: {
      'Lambda-Log-Group': context.logGroupName,
      'Lambda-Log-Stream': context.logStreamName,
      'Lambda-Run-Id': context.awsRequestId,
      'Package-Stats-Count': newStatsCount.toString(),
    },
  }).promise();
}

function updateStats(stats: DeepWriteable<PackageStatsOutput>, pkgName: string, entry: NpmDownloadsEntry) {
  stats.packages[pkgName] = {
    ...(stats.packages[pkgName] ?? {}),
    downloads: {
      ...(stats.packages[pkgName]?.downloads ?? {}),
      npm: entry.downloads,
    },
  };
}

async function fetchCurrentStatsObject(bucketName: string) {
  const statsData: AWS.S3.GetObjectOutput | undefined = await aws.s3()
    .getObject({ Bucket: bucketName, Key: constants.STATS_KEY })
    .promise()
    .catch((err: AWSError) => err.code !== 'NoSuchKey'
      ? Promise.reject(err)
      : Promise.resolve({ /* no data */ } as S3.GetObjectOutput));
  return statsData?.Body
    ? JSON.parse(statsData.Body.toString('utf-8'))
    : undefined;
}

export interface PackageStatsOutput {
  readonly packages: { [key: string]: PackageStatsEntry };
  readonly updated: string;
}

export interface PackageStatsEntry {
  readonly downloads: PackageStatsDownloads;
}

export interface PackageStatsDownloads {
  readonly npm: number;
}

type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };
