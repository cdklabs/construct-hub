import { metricScope, Unit } from 'aws-embedded-metrics';
import type { Context } from 'aws-lambda';
import got from 'got';
import { CatalogClient } from '../catalog-builder/client.lambda-shared';
import * as aws from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';
import { MetricName, METRICS_NAMESPACE } from './constants';
import { NpmDownloadsClient, NpmDownloadsEntry, NpmDownloadsPeriod } from './npm-downloads.lambda-shared';

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

  const STATS_BUCKET_NAME = requireEnv('STATS_BUCKET_NAME');
  const STATS_OBJECT_KEY = requireEnv('STATS_OBJECT_KEY');

  const catalogClient = await CatalogClient.newClient();
  const catalog = catalogClient.packages;
  if (catalog.length === 0) {
    throw new Error('No packages found.');
  }

  const currentDate = new Date().toISOString();
  const stats: PackageStatsOutput = { packages: {}, updated: currentDate };
  const npmClient = new NpmDownloadsClient(got);

  // remove duplicates from different major versions
  const packageNames = [...new Set(catalog.map(pkg => pkg.name)).values()];

  console.log(`Retrieving download stats for all ${packageNames.length} registered packages: [${packageNames.join(',')}].`);
  const npmDownloads = await npmClient.getDownloads(packageNames, {
    period: NpmDownloadsPeriod.LAST_WEEK,
    throwErrors: false,
  });

  for (const [pkgName, entry] of npmDownloads.entries()) {
    updateStats(stats, pkgName, entry);
  }

  // Update metrics
  const statsCount = Object.keys(stats.packages).length;
  console.log(`There are now ${statsCount} packages with NPM stats stored.`);
  await metricScope((metrics) => async () => {
    // Clear out default dimensions as we don't need those. See https://github.com/awslabs/aws-embedded-metrics-node/issues/73
    metrics.setDimensions();

    metrics.setNamespace(METRICS_NAMESPACE);
    metrics.putMetric(MetricName.REGISTERED_PACKAGES_WITH_STATS, statsCount, Unit.Count);
  })();

  // Upload the result to S3 and exit.
  return aws.s3().putObject({
    Bucket: STATS_BUCKET_NAME,
    Key: STATS_OBJECT_KEY,
    Body: JSON.stringify(stats, null, 2),
    ContentType: 'application/json',
    CacheControl: 'public, max-age=300', // Expire from cache after 5 minutes
    Metadata: {
      'Lambda-Log-Group': context.logGroupName,
      'Lambda-Log-Stream': context.logStreamName,
      'Lambda-Run-Id': context.awsRequestId,
      'Package-Stats-Count': `${statsCount}`,
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
