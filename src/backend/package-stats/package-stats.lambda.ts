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
    return Promise.reject('No catalog data found.');
  }

  const currentDate = new Date().toISOString();
  const stats: PackageStatsOutput = { packages: {}, updated: currentDate };
  const npmClient = new NpmDownloadsClient(got);
  const catalog: CatalogModel = JSON.parse(catalogData.Body.toString('utf-8'));

  // remove duplicates from different major versions
  const packageNames = [...new Set(catalog.packages.map(pkg => pkg.name)).values()];

  console.log(`Retrieving download stats for all ${packageNames.length} registered packages: [${packageNames.join(',')}].`);
  const npmDownloads = await npmClient.getDownloads(packageNames, {
    period: NpmDownloadsPeriod.LAST_WEEK,
    throwErrors: false,
  });

  for (const [pkgName, entry] of npmDownloads.entries()) {
    updateStats(stats, pkgName, entry);
  }

  // Update metrics
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
      'Package-Stats-Count': `${Object.keys(stats.packages).length}`,
    },
  }).promise();
}

function updateStats(stats: PackageStatsOutput, pkgName: string, entry: NpmDownloadsEntry) {
  stats.packages[pkgName] = {
    ...(stats.packages[pkgName] ?? {}),
    downloads: {
      ...(stats.packages[pkgName]?.downloads ?? {}),
      npm: entry.downloads,
    },
  };
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
