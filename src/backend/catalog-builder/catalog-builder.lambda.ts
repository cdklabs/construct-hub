import { gunzip } from 'zlib';

import type { AssemblyTargets } from '@jsii/spec';
import { metricScope, Unit } from 'aws-embedded-metrics';
import type { Context } from 'aws-lambda';
import { AWSError, S3 } from 'aws-sdk';
import { SemVer } from 'semver';
import { extract } from 'tar-stream';
import { DenyListClient } from '../deny-list/client.lambda-shared';
import type { CatalogBuilderInput } from '../payload-schema';
import * as aws from '../shared/aws.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';

const METRICS_NAMESPACE = 'ConstructHub/CatalogBuilder';

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

  // determine if this is a request to rebuild the catalog (basically, an empty event)
  const rebuild = !event?.package;
  if (rebuild) {
    console.log('Requesting catalog rebuild (empty event)');
  }

  const BUCKET_NAME = requireEnv('BUCKET_NAME');

  const packages = new Map<string, Map<number, PackageInfo>>();
  const denyList = await DenyListClient.newClient();

  let data: undefined | AWS.S3.GetObjectOutput;

  if (!rebuild) {
    console.log('Loading existing catalog...');

    data = await aws.s3().getObject({ Bucket: BUCKET_NAME, Key: constants.CATALOG_KEY }).promise()
      .catch((err: AWSError) => err.code !== 'NoSuchKey'
        ? Promise.reject(err)
        : Promise.resolve({ /* no data */ } as S3.GetObjectOutput));
  }

  // if event is empty, we're doing a full rebuild
  if (!data?.Body || rebuild) {
    console.log('Catalog not found. Recreating...');
    const failures: any = {};
    for await (const { Key: pkgKey } of relevantObjects(BUCKET_NAME)) {
      try {
        await appendPackage(packages, pkgKey!, BUCKET_NAME, denyList);
      } catch (e) {
        failures[pkgKey!] = e;
      }
    }
    for (const [key, error] of Object.entries(failures)) {
      console.log(`Failed processing ${key}: ${error}`);
    }

    await metricScope((metrics) => async () => {
      metrics.setNamespace(METRICS_NAMESPACE);
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
    // note that we intentionally don't catch errors here to let these
    // event go to the DLQ for manual inspection.
    await appendPackage(packages, event.package.key, BUCKET_NAME, denyList);
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
  await metricScope((metrics) => async () => {
    metrics.setNamespace(METRICS_NAMESPACE);
    metrics.putMetric('RegisteredPackagesMajorVersion', catalog.packages.length, Unit.Count);
  })();


  // Clean up existing entries if necessary. In particular, remove the license texts as they make
  // the catalog unnecessarily large, and may hinder some search queries' result quality.
  for (const entry of catalog.packages) {
    if (entry.metadata) {
      delete (entry.metadata as any).licenseText;
    }
  }

  // Upload the result to S3 and exit.
  return aws.s3().putObject({
    Bucket: BUCKET_NAME,
    Key: constants.CATALOG_KEY,
    Body: JSON.stringify(catalog, null, 2),
    ContentType: 'application/json',
    CacheControl: 'public, max-age=300', // Expire from cache after 5 minutes
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
      if (!object.Key?.endsWith(constants.PACKAGE_KEY_SUFFIX)) {
        continue;
      }
      // We only register packages if they have AT LEAST docs in one language.
      const tsDocs = `${object.Key.substring(0, object.Key.length - constants.PACKAGE_KEY_SUFFIX.length)}${constants.DOCS_KEY_SUFFIX_TYPESCRIPT}`;
      const pyDocs = `${object.Key.substring(0, object.Key.length - constants.PACKAGE_KEY_SUFFIX.length)}${constants.DOCS_KEY_SUFFIX_PYTHON}`;
      const javaDocs = `${object.Key.substring(0, object.Key.length - constants.PACKAGE_KEY_SUFFIX.length)}${constants.DOCS_KEY_SUFFIX_JAVA}`;
      if (!(await aws.s3ObjectExists(bucket, tsDocs)) &&
          !(await aws.s3ObjectExists(bucket, pyDocs)) &&
          !(await aws.s3ObjectExists(bucket, javaDocs))) {
        continue;
      }
      yield object;
    }
    request.ContinuationToken = result.NextContinuationToken;
  } while (request.ContinuationToken != null);
}

async function appendPackage(packages: any, pkgKey: string, bucketName: string, denyList: DenyListClient) {
  console.log(`Processing key: ${pkgKey}`);
  const [, packageName, versionStr] = constants.STORAGE_KEY_FORMAT_REGEX.exec(pkgKey)!;
  const version = new SemVer(versionStr);
  const found = packages.get(packageName)?.get(version.major);
  if (found != null && version.compare(found.version) <= 0) {
    console.log(`Skipping ${packageName}@${version} because it is not newer than the existing ${found.version}`);
    return;
  }

  console.log(`Checking if ${packageName}@${version.version} matches a deny list rule`);
  const blocked = denyList.lookup(packageName, version.version);
  if (blocked) {
    console.log(`Skipping ${packageName}@${version.version} because it is blocked by the deny list rule: ${JSON.stringify(blocked)}`);
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
