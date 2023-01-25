import { gunzip } from 'zlib';

import { Configuration, metricScope, Unit } from 'aws-embedded-metrics';
import type { Context } from 'aws-lambda';
import { AWSError, S3 } from 'aws-sdk';
import { SemVer } from 'semver';
import { extract } from 'tar-stream';
import { CatalogModel, PackageInfo } from '.';
import { MetricName, METRICS_NAMESPACE } from './constants';
import { CacheStrategy } from '../../caching';
import { DenyListClient } from '../deny-list/client.lambda-shared';
import type { CatalogBuilderInput } from '../payload-schema';
import * as aws from '../shared/aws.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';

Configuration.namespace = METRICS_NAMESPACE;

/**
 * Regenerates the `catalog.json` object in the configured S3 bucket.
 *
 * @param event configuration for the rebuild job. In particular, the `rebuild`
 *              property can be set to `true` in order to trigger a full (i.e:
 *              non-incremental) rebuild of the object.
 * @param context the lambda context in which this execution runs.
 *
 * @returns the information about the updated S3 object.
 */
export async function handler(event: CatalogBuilderInput, context: Context) {
  console.log(JSON.stringify(event, null, 2));

  const BUCKET_NAME = requireEnv('BUCKET_NAME');

  const packages = new Map<string, Map<number, PackageInfo>>();
  const denyList = await DenyListClient.newClient();

  console.log('Loading existing catalog (if present)...');

  const data = await aws
    .s3()
    .getObject({ Bucket: BUCKET_NAME, Key: constants.CATALOG_KEY })
    .promise()
    .catch((err: AWSError) =>
      err.code !== 'NoSuchKey'
        ? Promise.reject(err)
        : Promise.resolve({
            /* no data */
          } as S3.GetObjectOutput)
    );

  if (data.Body) {
    console.log('Catalog found. Loading...');
    const catalog: CatalogModel = JSON.parse(data.Body.toString('utf-8'));
    for (const info of catalog.packages) {
      const denyRule = denyList.lookup(info.name, info.version);
      if (denyRule != null) {
        console.log(
          `Dropping ${info.name}@${info.version} from catalog: ${denyRule.reason}`
        );
        continue;
      }
      if (!packages.has(info.name)) {
        packages.set(info.name, new Map());
      }
      packages.get(info.name)!.set(info.major, info);
    }
  }

  // If defined, the function will invoke itself again to resume the work from that key (this
  // happens only in "from scratch" or "rebuild" cases).
  let nextStartAfter: string | undefined;

  if (event.package) {
    if (!event.package.key.endsWith(constants.PACKAGE_KEY_SUFFIX)) {
      throw new Error(
        `The provided package key is invalid: ${event.package.key} does not end in ${constants.PACKAGE_KEY_SUFFIX}`
      );
    }

    console.log('Registering new packages...');
    // note that we intentionally don't catch errors here to let these
    // event go to the DLQ for manual inspection.
    await appendPackage(packages, event.package.key, BUCKET_NAME, denyList);
  }

  // If we don't have a package in event, then we're refreshing the catalog. This is also true if we
  // don't have a catalog body (from scratch) or if "startAfter" is set (continuation of from
  // scratch).
  if (!event?.package || !data.Body || event.startAfter) {
    console.log('Recreating or refreshing catalog...');
    const failures: any = {};
    for await (const { Key: pkgKey } of relevantObjects(
      BUCKET_NAME,
      event.startAfter
    )) {
      try {
        await appendPackage(packages, pkgKey!, BUCKET_NAME, denyList);
      } catch (e) {
        failures[pkgKey!] = e;
      }
      // If we're getting short on time (1 minute out of 15 left), we'll be continuing in a new
      // invocation after writing what we've done so far to S3...
      if (context.getRemainingTimeInMillis() <= 60_000) {
        nextStartAfter = pkgKey;
        break;
      }
    }
    for (const [key, error] of Object.entries(failures)) {
      console.log(`Failed processing ${key}: ${error}`);
    }

    await metricScope((metrics) => async () => {
      metrics.setDimensions();
      const failedCount = Object.keys(failures).length;
      console.log(`Marking ${failedCount} failed packages`);
      metrics.putMetric(
        MetricName.FAILED_PACKAGES_ON_RECREATION,
        failedCount,
        Unit.Count
      );
    })();
  }

  // Build the final data package...
  console.log('Consolidating catalog...');
  const catalog: CatalogModel = {
    packages: new Array<PackageInfo>(),
    updated: new Date().toISOString(),
  };
  for (const majors of packages.values()) {
    for (const pkg of majors.values()) {
      catalog.packages.push(pkg);
    }
  }

  console.log(
    `There are now ${catalog.packages.length} registered package major versions`
  );
  await metricScope((metrics) => async () => {
    metrics.setDimensions();
    metrics.putMetric(
      MetricName.REGISTERED_PACKAGES_MAJOR_VERSION,
      catalog.packages.length,
      Unit.Count
    );
    metrics.putMetric(
      MetricName.REGISTERED_PACKAGES,
      new Set(catalog.packages.map((p) => p.name)).size,
      Unit.Count
    );
    metrics.putMetric(
      MetricName.MISSING_CONSTRUCT_FRAMEWORK_COUNT,
      catalog.packages.filter((pkg) => pkg.constructFramework == null).length,
      Unit.Count
    );
    metrics.putMetric(
      MetricName.MISSING_CONSTRUCT_FRAMEWORK_VERSION_COUNT,
      catalog.packages.filter(
        (pkg) =>
          pkg.constructFramework && pkg.constructFramework.majorVersion == null
      ).length,
      Unit.Count
    );
  })();

  // Clean up existing entries if necessary. In particular, remove the license texts as they make
  // the catalog unnecessarily large, and may hinder some search queries' result quality.
  for (const entry of catalog.packages) {
    if (entry.metadata) {
      delete (entry.metadata as any).licenseText;
    }
  }

  // Upload the result to S3 and exit.
  const result = await aws
    .s3()
    .putObject({
      Bucket: BUCKET_NAME,
      Key: constants.CATALOG_KEY,
      Body: JSON.stringify(catalog, null, 2),
      ContentType: 'application/json',
      CacheControl: CacheStrategy.default().toString(),
      Metadata: {
        'Lambda-Log-Group': context.logGroupName,
        'Lambda-Log-Stream': context.logStreamName,
        'Lambda-Run-Id': context.awsRequestId,
        'Package-Count': `${catalog.packages.length}`,
      },
    })
    .promise();

  if (nextStartAfter != null) {
    console.log(`Will continue from ${nextStartAfter} in new invocation...`);
    const nextEvent: CatalogBuilderInput = {
      ...event,
      startAfter: nextStartAfter,
    };
    // We start it asynchronously, as this function has a provisionned
    // concurrency of 1 (so a synchronous attempt would always be throttled).
    await aws
      .lambda()
      .invokeAsync({
        FunctionName: context.functionName,
        InvokeArgs: JSON.stringify(nextEvent, null, 2),
      })
      .promise();
  } else {
    if (process.env.FEED_BUILDER_FUNCTION_NAME) {
      // Catalog is updated. Update the RSS/ATOM feed
      await aws
        .lambda()
        .invokeAsync({
          FunctionName: process.env.FEED_BUILDER_FUNCTION_NAME,
          InvokeArgs: JSON.stringify({}),
        })
        .promise();
    }
  }

  return result;
}

/**
 * A generator that asynchronously traverses the set of "interesting" objects
 * found by listing the configured S3 bucket. Those objects correspond to all
 * npm package tarballs present under the `packages/` prefix in the bucket.
 *
 * @param bucket the bucket in which to list objects
 * @param startAfter the key to start reading from, if provided.
 */
async function* relevantObjects(bucket: string, startAfter?: string) {
  const request: S3.ListObjectsV2Request = {
    Bucket: bucket,
    Prefix: constants.STORAGE_KEY_PREFIX,
    StartAfter: startAfter,
  };
  do {
    const result = await aws.s3().listObjectsV2(request).promise();
    for (const object of result.Contents ?? []) {
      if (!object.Key?.endsWith(constants.PACKAGE_KEY_SUFFIX)) {
        continue;
      }
      // We only register packages if they have AT LEAST docs in one language.
      const tsDocs = `${object.Key.substring(
        0,
        object.Key.length - constants.PACKAGE_KEY_SUFFIX.length
      )}${constants.DOCS_KEY_SUFFIX_TYPESCRIPT}`;
      const pyDocs = `${object.Key.substring(
        0,
        object.Key.length - constants.PACKAGE_KEY_SUFFIX.length
      )}${constants.DOCS_KEY_SUFFIX_PYTHON}`;
      const javaDocs = `${object.Key.substring(
        0,
        object.Key.length - constants.PACKAGE_KEY_SUFFIX.length
      )}${constants.DOCS_KEY_SUFFIX_JAVA}`;
      const csharpDocs = `${object.Key.substring(
        0,
        object.Key.length - constants.PACKAGE_KEY_SUFFIX.length
      )}${constants.DOCS_KEY_SUFFIX_CSHARP}`;
      const goDocs = `${object.Key.substring(
        0,
        object.Key.length - constants.PACKAGE_KEY_SUFFIX.length
      )}${constants.DOCS_KEY_SUFFIX_GO}`;
      if (
        !(await aws.s3ObjectExists(bucket, tsDocs)) &&
        !(await aws.s3ObjectExists(bucket, pyDocs)) &&
        !(await aws.s3ObjectExists(bucket, javaDocs)) &&
        !(await aws.s3ObjectExists(bucket, csharpDocs)) &&
        !(await aws.s3ObjectExists(bucket, goDocs))
      ) {
        continue;
      }
      yield object;
    }
    request.ContinuationToken = result.NextContinuationToken;
  } while (request.ContinuationToken != null);
}

async function appendPackage(
  packages: any,
  pkgKey: string,
  bucketName: string,
  denyList: DenyListClient
) {
  console.log(`Processing key: ${pkgKey}`);
  const [, packageName, versionStr] =
    constants.STORAGE_KEY_FORMAT_REGEX.exec(pkgKey)!;
  const version = new SemVer(versionStr);
  const found = packages.get(packageName)?.get(version.major);
  // If the version is === to the current latest, we'll be replacing that (so re-generated metadata are taken into account)
  if (found != null && version.compare(found.version) < 0) {
    console.log(
      `Skipping ${packageName}@${version} because it is not newer than the existing ${found.version}`
    );
    return;
  }

  console.log(
    `Checking if ${packageName}@${version.version} matches a deny list rule`
  );
  const blocked = denyList.lookup(packageName, version.version);
  if (blocked) {
    console.log(
      `Skipping ${packageName}@${
        version.version
      } because it is blocked by the deny list rule: ${JSON.stringify(blocked)}`
    );
    return;
  }

  console.log(`Registering ${packageName}@${version}`);

  // Donwload the tarball to inspect the `package.json` data therein.
  const pkg = await aws
    .s3()
    .getObject({ Bucket: bucketName, Key: pkgKey })
    .promise();
  const metadataKey = pkgKey.replace(
    constants.PACKAGE_KEY_SUFFIX,
    constants.METADATA_KEY_SUFFIX
  );
  const metadataResponse = await aws
    .s3()
    .getObject({ Bucket: bucketName, Key: metadataKey })
    .promise();
  const manifest = await new Promise<Buffer>((ok, ko) => {
    gunzip(Buffer.from(pkg.Body! as any), (err, tar) => {
      if (err) {
        return ko(err);
      }
      extract()
        .on('entry', (header, stream, next) => {
          if (header.name !== 'package/package.json') {
            // Not the file we are looking for, skip ahead (next run-loop tick).
            return setImmediate(next);
          }
          const chunks = new Array<Buffer>();
          return stream
            .on('data', (chunk) => chunks.push(Buffer.from(chunk)))
            .once('end', () => {
              ok(Buffer.concat(chunks));
              next();
            })
            .resume();
        })
        .once('finish', () => {
          ko(new Error('Could not find package/package.json in tarball!'));
        })
        .write(tar, (writeErr) => {
          if (writeErr) {
            ko(writeErr);
          }
        });
    });
  });
  // Add the PackageInfo into the working set
  const pkgMetadata = JSON.parse(manifest.toString('utf-8'));
  const npmMetadata = JSON.parse(
    metadataResponse?.Body?.toString('utf-8') ?? '{}'
  );
  const major = new SemVer(pkgMetadata.version).major;
  if (!packages.has(pkgMetadata.name)) {
    packages.set(pkgMetadata.name, new Map());
  }
  packages.get(pkgMetadata.name)!.set(major, {
    author: pkgMetadata.author,
    description: pkgMetadata.description,
    keywords: pkgMetadata.keywords,
    languages: pkgMetadata.jsii.targets,
    license: pkgMetadata.license,
    major,
    metadata: npmMetadata,
    name: pkgMetadata.name,
    version: pkgMetadata.version,
  });
}
