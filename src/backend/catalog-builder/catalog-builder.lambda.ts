import { env } from 'process';
import { gunzip } from 'zlib';

import type { AssemblyTargets } from '@jsii/spec';
// eslint-disable-next-line import/no-unresolved
import type { Context } from 'aws-lambda';
import { AWSError, S3 } from 'aws-sdk';
import { SemVer } from 'semver';
import { extract } from 'tar-stream';

let s3: S3 | undefined;

export const CATALOG_OBJECT_KEY = 'catalog.json';

const KEY_FORMAT_REGEX = /^packages\/((?:@[^/]+\/)?[^/]+)\/v([^/]+)\/.*$/;
// Capture groups:                   ┗━━━━━━━━1━━━━━━━━━┛   ┗━━2━━┛

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
export async function handler(event: { readonly rebuild?: boolean }, context: Context) {
  const BUCKET_NAME = requireEnv('BUCKET_NAME');

  const packages = new Map<string, Map<number, PackageInfo>>();

  if (!event.rebuild) {
    console.log('Loading existing catalog...');
    const data = await s3Client().getObject({ Bucket: BUCKET_NAME, Key: CATALOG_OBJECT_KEY }).promise()
      .catch((err: AWSError) => err.code !== 'NoSuchKey'
        ? Promise.reject(err)
        : Promise.resolve({ /* no data */ } as S3.GetObjectOutput));

    if (data.Body != null) {
      const catalog = JSON.parse(data.Body.toString('utf-8'));
      for (const info of catalog.packages) {
        if (!packages.has(info.name)) {
          packages.set(info.name, new Map());
        }
        packages.get(info.name)!.set(info.major, info);
      }
    }
  } else {
    console.log('Rebuild requested, ignoring existing catalog...');
  }

  console.log('Listing existing objects...');
  for await (const object of relevantObjects(BUCKET_NAME)) {
    // Ensure we don't already have a more recent version tracked for this package-major.
    const [, packageName, versionStr] = object.Key!.match(KEY_FORMAT_REGEX)!;
    const version = new SemVer(versionStr);
    const found = packages.get(packageName)?.get(version.major);
    if (found != null && version.compare(found.version) <= 0) {
      console.log(`Skipping ${packageName}@${version} because it is not newer than the existing ${found.version}`);
      continue;
    }
    console.log(`Registering ${packageName}@${version}`);

    // Donwload the tarball to inspect the `package.json` data therein.
    const data = await s3Client().getObject({ Bucket: BUCKET_NAME, Key: object.Key! }).promise();
    const manifest = await new Promise<Buffer>((ok, ko) => {
      gunzip(Buffer.from(data.Body!), (err, tar) => {
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
    const metadata = JSON.parse(manifest.toString('utf-8'));
    const major = new SemVer(metadata.version).major;
    if (!packages.has(metadata.name)) {
      packages.set(metadata.name, new Map());
    }
    packages.get(metadata.name)!.set(major, {
      author: metadata.author,
      description: metadata.description,
      keywords: metadata.keywords,
      languages: metadata.jsii.targets,
      license: metadata.license,
      major,
      metadata: metadata.jsii.metadata,
      name: metadata.name,
      time: metadata.time, // TODO: Change this to an appropriate value
      version: metadata.version,
    });
  }

  // Build the final data package...
  console.log('Consolidating catalog...');
  const catalog = { packages: new Array<PackageInfo>(), updated: new Date().toISOString() };
  for (const majors of packages.values()) {
    for (const pkg of majors.values()) {
      catalog.packages.push(pkg);
    }
  }

  console.log(`Registered ${catalog.packages.length} package major versions`);
  // Upload the result to S3 and exit.
  return s3Client().putObject({
    Bucket: BUCKET_NAME,
    Key: CATALOG_OBJECT_KEY,
    Body: JSON.stringify(catalog, null, 2),
    ContentType: 'text/json',
    Metadata: {
      'Build-Process': event.rebuild ? 'FROM_SCRATCH' : 'INCREMENTAL',
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
  const request: S3.ListObjectsV2Request = { Bucket: bucket, Prefix: 'packages/' };
  do {
    const result = await s3!.listObjectsV2(request).promise();
    for (const object of result.Contents ?? []) {
      if (!object.Key?.endsWith('/package.tgz')) {
        continue;
      }
      yield object;
    }
    request.ContinuationToken = result.NextContinuationToken;
  } while (request.ContinuationToken != null);
}

/**
 * Reads the specified value from the environment of this process, and ensures a
 * value was provided.
 *
 * @param name the name of the environment variable to read.
 *
 * @returns the value of the environment variable, as-is.
 *
 * @throws if the environment variable had no value.
 */
function requireEnv(name: string): string {
  const result = env[name];
  if (!result) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return result;
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

/**
 * Visible for testing. This function ensures a new S3 client is used for the
 * next invocation.
 */
export function reset() {
  s3 = undefined;
}

function s3Client(): S3 {
  if (s3 == null) {
    s3 = new S3();
  }
  return s3;
}
