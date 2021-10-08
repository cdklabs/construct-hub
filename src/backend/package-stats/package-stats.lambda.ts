import { metricScope, Unit } from 'aws-embedded-metrics';
import type { Context } from 'aws-lambda';
import type { AWSError, S3 } from 'aws-sdk';
import got from 'got';
import { CatalogModel, PackageInfo } from '../catalog-builder';
import { NpmDownloadsClient, NpmDownloadsEntry, NpmDownloadsPeriod } from '../catalog-builder/npm-downloads.lambda-shared';
import { PackageStatsInput } from '../payload-schema';
import * as aws from '../shared/aws.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';

const METRICS_NAMESPACE = 'ConstructHub/PackageStats';

/**
 * Updates or regenerates the `stats.json` object in the configured S3 bucket.
 *
 * @param event configuration for the rebuild job. If a package is provided,
 *              just that package will be updated - otherwise, it is assumed
 *              that the all of the stats are to be regenerated.
 * @param context the lambda context in which this execution runs.
 *
 * @returns the information about the updated S3 object.
 */
export async function handler(event: PackageStatsInput, context: Context) {
  console.log(JSON.stringify(event, null, 2));

  // determine if this is a request to rebuild the catalog (basically, an empty event)
  const rebuild = !(event.package);
  if (rebuild) {
    console.log('Requesting package stats rebuild (empty event)');
  }

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
  const npmClient = new NpmDownloadsClient(got);
  const catalog: CatalogModel = JSON.parse(catalogData.Body.toString('utf-8'));
  const currentDate = new Date().toISOString();

  // stats.json to use if we are building from scratch, or the object
  // does not exist in the bucket
  const emptyStats: PackageStatsOutput = { packages: {}, updated: currentDate };

  if (rebuild) {

    let packageNames = catalog.packages.map(pkg => pkg.name);
    packageNames = [...new Set(packageNames).values()];

    stats = emptyStats;

    console.log(`Retrieving download stats for all registered pacakges: [${packageNames.join(',')}].`);
    const npmDownloads = await npmClient.getDownloads(packageNames, {
      period: NpmDownloadsPeriod.LAST_WEEK,
      throwErrors: false,
    });

    for (const [pkgName, entry] of Object.entries(npmDownloads)) {
      updateStats(stats, pkgName, entry, currentDate);
    }

  } else {

    const pkgKey = event.package.key;
    console.log(`Processing key: ${pkgKey}`);
    const [, packageName] = constants.STORAGE_KEY_FORMAT_REGEX.exec(pkgKey)!;
    if (!existsInCatalog(packageName, catalog)) {
      throw new Error(`Package ${packageName} does not appear to be registered in the catalog.`);
    }

    stats = await fetchCurrentStatsObject(BUCKET_NAME) ?? { packages: {}, updated: currentDate };

    console.log(`Retrieving download stats for ${packageName}`);
    const npmDownloads = await npmClient.getDownloads([packageName], { period: NpmDownloadsPeriod.LAST_WEEK });

    for (const [pkgName, entry] of Object.entries(npmDownloads)) {
      updateStats(stats, pkgName, entry, currentDate);
    }

  }

  stats.updated = currentDate;

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

function existsInCatalog(pkgName: string, catalog: { packages: Array<PackageInfo>; updated: string }): boolean {
  for (const pkg of catalog.packages) {
    if (pkg.name === pkgName) {
      return true;
    }
  }
  return false;
}

function updateStats(stats: DeepWriteable<PackageStatsOutput>, pkgName: string, entry: NpmDownloadsEntry, date: string) {
  stats.packages[pkgName] = {
    ...(stats.packages[pkgName] ?? {}),
    downloads: {
      ...(stats.packages[pkgName]?.downloads ?? {}),
      npm: {
        count: entry.downloads,
        updated: date,
      },
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
  readonly npm: PackageStatsDownloadsDetail;
}

export interface PackageStatsDownloadsDetail {
  readonly count: number;
  readonly updated: string;
}

type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };
