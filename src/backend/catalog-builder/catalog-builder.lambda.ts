import { gunzip } from 'zlib';

import type { AssemblyTargets } from '@jsii/spec';
import { metricScope, Unit } from 'aws-embedded-metrics';
// eslint-disable-next-line import/no-unresolved
import type { Context, S3Event } from 'aws-lambda';
import { AWSError, S3 } from 'aws-sdk';
import { SemVer } from 'semver';
import { extract } from 'tar-stream';
import * as aws from '../shared/aws.lambda-shared';
import * as constants from '../shared/constants.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';

const KEY_FORMAT_REGEX = new RegExp(`^${constants.STORAGE_KEY_PREFIX}((?:@[^/]+/)?[^/]+)/v([^/]+)/.*$`);
// Capture groups:                                                   ┗━━━━━━━━1━━━━━━━━┛  ┗━━2━━┛

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
export async function handler(event: S3Event, context: Context) {

  console.log(JSON.stringify(event, null, 2));

  const BUCKET_NAME = requireEnv('BUCKET_NAME');

  const packages = new Map<string, Map<number, PackageInfo>>();

  console.log('Loading existing catalog...');
  const data = await aws.s3().getObject({ Bucket: BUCKET_NAME, Key: constants.CATALOG_KEY }).promise()
    .catch((err: AWSError) => err.code !== 'NoSuchKey'
      ? Promise.reject(err)
      : Promise.resolve({ /* no data */ } as S3.GetObjectOutput));

  if (!data.Body) {
    console.log('Catalog not found. Recreating...');
    const failures: any = {};
    for await (const object of relevantObjects(BUCKET_NAME)) {
      const assemblyKey = object.Key!;
      try {
        await appendPackage(packages, assemblyKey, BUCKET_NAME);
      } catch (e) {
        failures[assemblyKey] = e;
      }
    }
    for (const [key, error] of Object.entries(failures)) {
      console.log(`Failed processing ${key}: ${error}`);
    }

    await metricScope((metrics) => async () => {
      metrics.setNamespace('ConstructHub/CatalogBuilder');
      const failedCount = Object.keys(failures).length;
      console.log(`Marking ${failedCount} failed packages`);
      metrics.putMetric('FailedPackagesOnRecreation', failedCount, Unit.Count);
    })();

  } else {
    console.log('Catalog found. Loading...');
    const catalog = JSON.parse(data.Body.toString('utf-8'));
    for (const info of catalog.packages) {
      if (!packages.has(info.name)) {
        packages.set(info.name, new Map());
      }
      packages.get(info.name)!.set(info.major, info);
    }
    console.log('Registering new packages...');
    for (const record of event.Records) {

      // Key names are escaped (`@` as `%40`) in the input payload... Decode it here... We cannot use
      // `decodeURI` here because it does not undo encoding that `encodeURI` would not have done, and
      // that would not replace `@` in the position where it is in the keys... So we have to work on
      // the URI components instead.
      const key = record.s3.object.key.split('/').map((comp) => decodeURIComponent(comp)).join('/');

      // note that we intentionally don't catch errors here to let these
      // event go to the DLQ for manual inspection.
      await appendPackage(packages, key, BUCKET_NAME);
    }
  }

  // Build the final data package...
  console.log('Consolidating catalog...');
  const catalog = { packages: new Array<PackageInfo>(), updated: new Date().toISOString() };
  for (const majors of packages.values()) {
    for (const pkg of majors.values()) {
      catalog.packages.push(pkg);
    }
  }

  console.log(`There are now ${catalog.packages.length} registered package major versions`);
  // Upload the result to S3 and exit.
  return aws.s3().putObject({
    Bucket: BUCKET_NAME,
    Key: constants.CATALOG_KEY,
    Body: JSON.stringify(catalog, null, 2),
    ContentType: 'text/json',
    Metadata: {
      'Lambda-Log-Group': context.logGroupName,
      'Lambda-Log-Stream': context.logStreamName,
      'Lambda-Run-Id': context.awsRequestId,
      'Package-Count': `${catalog.packages.length}`,
    },
  }).promise();

}

/**
 * A generator that asynchronously traverses the set of "interesting" objects
 * found by listing the configured S3 bucket. Those objects correspond to all
 * npm package tarballs present under the `packages/` prefix in the bucket.
 */
async function* relevantObjects(bucket: string) {
  const request: S3.ListObjectsV2Request = { Bucket: bucket, Prefix: constants.STORAGE_KEY_PREFIX };
  do {
    const result = await aws.s3().listObjectsV2(request).promise();
    for (const object of result.Contents ?? []) {
      if (!object.Key?.endsWith(constants.ASSEMBLY_KEY_SUFFIX)) {
        continue;
      }
      yield object;
    }
    request.ContinuationToken = result.NextContinuationToken;
  } while (request.ContinuationToken != null);
}

async function appendPackage(packages: any, assemblyKey: string, bucketName: string) {
  console.log(`Processing key: ${assemblyKey}`);
  const pkgKey = assemblyKey.replace(constants.ASSEMBLY_KEY_SUFFIX, constants.PACKAGE_KEY_SUFFIX);
  const [, packageName, versionStr] = pkgKey.match(KEY_FORMAT_REGEX)!;
  const version = new SemVer(versionStr);
  const found = packages.get(packageName)?.get(version.major);
  if (found != null && version.compare(found.version) <= 0) {
    console.log(`Skipping ${packageName}@${version} because it is not newer than the existing ${found.version}`);
    return;
  }
  console.log(`Registering ${packageName}@${version}`);

  // Donwload the tarball to inspect the `package.json` data therein.
  const pkg = await aws.s3().getObject({ Bucket: bucketName, Key: pkgKey }).promise();
  const metadataKey = pkgKey.replace(constants.PACKAGE_KEY_SUFFIX, constants.METADATA_KEY_SUFFIX);
  const metadataResponse = await aws.s3().getObject({ Bucket: bucketName, Key: metadataKey }).promise();
  const manifest = await new Promise<Buffer>((ok, ko) => {
    gunzip(Buffer.from(pkg.Body!), (err, tar) => {
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
  const npmMetadata = JSON.parse(metadataResponse?.Body?.toString('utf-8') ?? '{}');
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
    time: pkgMetadata.time, // TODO: Change this to an appropriate value
    version: pkgMetadata.version,
  });

}

interface PackageInfo {
  /**
   * The name of the assembly.
   */
  readonly name: string;

  /**
   * The major version of this assembly, according to SemVer.
   */
  readonly major: number;

  /**
   * The complete SemVer version string for this package's major version stream,
   * including pre-release identifiers, but excluding additional metadata
   * (everything starting at `+`, if there is any).
   */
  readonly version: string;

  /**
   * The SPDX license identifier for the package's license.
   */
  readonly license: string;

  /**
   * The list of keywords configured on the package.
   */
  readonly keywords: readonly string[];

  /**
   * Metadata assigned by the discovery function to the latest release of this
   * package's major version stream, if any.
   */
  readonly metadata?: { readonly [key: string]: string };

  /**
   * The author of the package.
   */
  readonly author: {
    readonly name: string;
    readonly email?: string;
    readonly url?: string;
  };

  /**
   * The list of languages configured on the package, and the corresponding
   * configuration.
   */
  readonly languages: AssemblyTargets;

  /**
   * The timestamp at which this version was created.
   */
  readonly time: Date;

  /**
   * The description of the package.
   */
  readonly description?: string;
}
