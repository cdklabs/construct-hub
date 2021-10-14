import * as console from 'console';
import { gzipSync, gunzipSync } from 'zlib';

import { metricScope, Configuration, MetricsLogger, Unit } from 'aws-embedded-metrics';
import type { Context, ScheduledEvent } from 'aws-lambda';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Nano = require('nano');
import { DenyListClient } from '../../backend/deny-list/client.lambda-shared';
import { LicenseListClient } from '../../backend/license-list/client.lambda-shared';
import * as aws from '../../backend/shared/aws.lambda-shared';
import { requireEnv } from '../../backend/shared/env.lambda-shared';
import { MetricName, MARKER_FILE_NAME, METRICS_NAMESPACE } from './constants.lambda-shared';
import { PackageVersion } from './stage-and-notify.lambda';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const normalizeNPMMetadata = require('normalize-registry-metadata');

const TIMEOUT_MILLISECONDS = 10_000;
const CONSTRUCT_KEYWORDS: ReadonlySet<string> = new Set(['cdk', 'aws-cdk', 'awscdk', 'cdk8s', 'cdktf']);
const NPM_REPLICA_REGISTRY_URL = 'https://replicate.npmjs.com/';

/**
 * The release date of `aws-cdk@0.8.0`. Anything earlier than this basically is
 * not a relevant package, as it cannot possibly be a constructs-based package.
 * This is used to fast-forward over boring stuff when the sequence number is
 * reset.
 */
const DAWN_OF_CONSTRUCTS = new Date('2018-07-31T13:43:04.615Z');

// Configure embedded metrics format
Configuration.namespace = METRICS_NAMESPACE;

/**
 * This function triggers on a fixed schedule and reads a stream of changes from npmjs couchdb _changes endpoint.
 * Upon invocation the function starts reading from a sequence stored in an s3 object - the `marker`.
 * If the marker fails to load (or do not exist), the stream will start from `now` - the latest change.
 * For each change:
 *  - the package version tarball will be copied from the npm registry to a stating bucket.
 *  - a message will be sent to an sqs queue
 * npm registry API docs: https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md
 * @param context a Lambda execution context
 */
export async function handler(event: ScheduledEvent, context: Context) {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  const stagingBucket = requireEnv('BUCKET_NAME');
  const stagingFunction = requireEnv('FUNCTION_NAME');

  const denyList = await DenyListClient.newClient();
  const licenseList = await LicenseListClient.newClient();

  const db = Nano(NPM_REPLICA_REGISTRY_URL).db.use('registry');

  const { marker: initialMarker, knownVersions } = await loadLastTransactionMarker(db);

  const config: Nano.ChangesReaderOptions = {
    includeDocs: true,
    // pause the changes reader after each request
    wait: true,
    since: initialMarker.toFixed(),
    // `changesReader.get` stops once a response with zero changes is received, however it waits too long
    //  since we want to terminate the Lambda function we define a timeout shorter than the default
    timeout: TIMEOUT_MILLISECONDS,
    // Only items with a name
    selector: {
      name: { $gt: null },
    },
    // Small pages, because we'll be looking at ALL versions of ALL packages... it adds up...
    batchSize: 30,
  };

  // We need to make an explicit Promise here, because otherwise Lambda won't
  // know when it's done...
  return new Promise((ok, ko) => {
    let updatedMarker = initialMarker;
    // The slowest batch processing time so far (starts at 30 seconds). This is how much time should
    // be left before timeout if a new batch is to be fetched.
    let maxBatchProcessingTime = 30_000;

    db.changesReader.get(config)
      .on('batch', metricScope((metrics) => async (batch: readonly Change[]) => {
        // Clear automatically set dimensions - we don't need them (see https://github.com/awslabs/aws-embedded-metrics-node/issues/73)
        metrics.setDimensions();

        metrics.setProperty('StartSeq', updatedMarker);
        const startTime = Date.now();

        // The most recent "modified" timestamp observed in the batch.
        let lastModified: Date | undefined;
        // Emit npm.js replication lag
        for (const { doc } of batch) {
          if (doc?.time?.modified) {
            const modified = new Date(doc.time.modified);
            metrics.putMetric(
              MetricName.NPMJS_CHANGE_AGE,
              startTime - modified.getTime(),
              Unit.Milliseconds,
            );
            if (lastModified == null || lastModified < modified) {
              lastModified = modified;
            }
          }
        }

        try {
          console.log(`Received a batch of ${batch.length} element(s)`);
          metrics.putMetric(MetricName.CHANGE_COUNT, batch.length, Unit.Count);
          const lastSeq = Math.max(...batch.map((change) => change.seq));
          metrics.setProperty('EndSeq', updatedMarker);

          if (lastModified && lastModified < DAWN_OF_CONSTRUCTS) {
            console.log(`Skipping batch as the latest modification is ${lastModified}, which is pre-Constructs`);
          } else {
            // Obtain the modified package version from the update event, and filter
            // out packages that are not of interest to us (not construct libraries).
            const versionInfos = getRelevantVersionInfos(batch, metrics, denyList, licenseList, knownVersions);
            console.log(`Identified ${versionInfos.length} relevant package version update(s)`);
            metrics.putMetric(MetricName.RELEVANT_PACKAGE_VERSIONS, versionInfos.length, Unit.Count);

            // Process all remaining updates
            await Promise.all(versionInfos.map(async ({ infos, modified, seq }) => {
              const invokeArgs: PackageVersion = {
                integrity: infos.dist.shasum,
                modified: modified.toISOString(),
                name: infos.name,
                seq: seq.toFixed(),
                tarballUrl: infos.dist.tarball,
                version: infos.version,
              };
              // "Fire-and-forget" invocation here.
              const invokeResult = await aws.lambda().invokeAsync({
                FunctionName: stagingFunction,
                InvokeArgs: JSON.stringify(invokeArgs, null, 2),
              }).promise();
              // Record that this is now a "known" version (no need to re-discover)
              knownVersions.set(`${infos.name}@${infos.version}`, modified);
              return invokeResult;
            }));
          }

          // Update the transaction marker in S3.
          await saveLastTransactionMarker(lastSeq);
          updatedMarker = lastSeq;

          // If we have enough time left before timeout, proceed with the next batch, otherwise we're done here.
          // Since the distribution of the time it takes to process each package/batch is non uniform, this is a best
          // effort, and we expect the function to timeout in some invocations, we rely on the downstream idempotency to handle this.
          maxBatchProcessingTime = Math.max(maxBatchProcessingTime, Date.now() - startTime);
          if (context.getRemainingTimeInMillis() >= maxBatchProcessingTime) {
            console.log('There is still time, requesting the next batch...');
            // Note: the `resume` function is missing from the `nano` type definitions, but is there...
            (db.changesReader as any).resume();
          } else {
            console.log('We are almost out of time, so stopping here.');
            db.changesReader.stop();
            metrics.putMetric(MetricName.REMAINING_TIME, context.getRemainingTimeInMillis(), Unit.Milliseconds);
            ok({ initialMarker, updatedMarker });
          }
        } catch (err) {
          // An exception bubbled out, which means this Lambda execution has failed.
          console.error(`Unexpected error: ${err}`);
          db.changesReader.stop();
          ko(err);
        } finally {
          metrics.putMetric(MetricName.BATCH_PROCESSING_TIME, Date.now() - startTime, Unit.Milliseconds);
          metrics.putMetric(MetricName.LAST_SEQ, updatedMarker, Unit.None);
        }
      }))
      .once('end', () => {
        console.log('No more updates to process, exiting.');
        ok({ initialMarker, updatedMarker });
      });
  });

  //#region Last transaction marker
  /**
   * Loads the last transaction marker from S3.
   *
   * @param registry a Nano database corresponding to the Npmjs.com CouchDB instance.
   *
   * @returns the value of the last transaction marker.
   */
  async function loadLastTransactionMarker(registry: Nano.DocumentScope<unknown>): Promise<{ marker: number; knownVersions: Map<string, Date> }> {
    try {
      const response = await aws.s3().getObject({
        Bucket: stagingBucket,
        Key: MARKER_FILE_NAME,
      }).promise();
      if (response.ContentEncoding === 'gzip') {
        response.Body = gunzipSync(Buffer.from(response.Body!));
      }
      let data = JSON.parse(
        response.Body!.toString('utf-8'),
        (key, value) => {
          if (key !== 'knownVersions') {
            return value;
          }
          const map = new Map<string, Date>();
          for (const [pkgVersion, iso] of Object.entries(value)) {
            if (typeof iso === 'string' || typeof iso === 'number') {
              map.set(pkgVersion, new Date(iso));
            } else {
              console.error(`Ignoring invalid entry: ${pkgVersion} => ${iso}`);
            }
          }
          return map;
        },
      );
      if (typeof data === 'number') {
        data = { marker: data, knownVersions: new Map() };
      }
      console.log(`Read last transaction marker: ${data.marker}`);

      const dbUpdateSeq = (await registry.info()).update_seq;
      if (dbUpdateSeq < data.marker) {
        console.warn(`Current DB update_seq (${dbUpdateSeq}) is lower than marker (CouchDB instance was likely replaced), resetting to 0!`);
        return { marker: 0, knownVersions: data.knownVersion };
      }

      return data;
    } catch (error) {
      if (error.code !== 'NoSuchKey') {
        throw error;
      }
      console.warn(`Marker object (s3://${stagingBucket}/${MARKER_FILE_NAME}) does not exist, starting from scratch`);
      return { marker: 0, knownVersions: new Map() };
    }
  }

  /**
   * Updates the last transaction marker in S3.
   *
   * @param marker the last transaction marker value
   */
  async function saveLastTransactionMarker(marker: number) {
    console.log(`Updating last transaction marker to ${marker}`);
    return putObject(
      MARKER_FILE_NAME,
      gzipSync(
        JSON.stringify(
          { marker, knownVersions },
          (_, value) => {
            if (value instanceof Date) {
              return value.toISOString();
            } else if (value instanceof Map) {
              return Object.fromEntries(value);
            } else {
              return value;
            }
          },
          2,
        ),
        { level: 9 },
      ),
      {
        ContentType: 'text/plain; charset=UTF-8',
        ContentEncoding: 'gzip',
      },
    );
  }
  //#endregion

  //#region Asynchronous Primitives
  /**
   * Puts an object in the staging bucket, with standardized object metadata.
   *
   * @param key  the key for the object to be put.
   * @param body the body of the object to be put.
   * @param opts any other options to use when sending the S3 request.
   *
   * @returns the result of the S3 request.
   */
  function putObject(key: string, body: AWS.S3.Body, opts: Omit<AWS.S3.PutObjectRequest, 'Bucket' | 'Key' | 'Body'> = {}) {
    return aws.s3().putObject({
      Bucket: stagingBucket,
      Key: key,
      Body: body,
      Metadata: {
        'Lambda-Log-Group': context.logGroupName,
        'Lambda-Log-Stream': context.logStreamName,
        'Lambda-Run-Id': context.awsRequestId,
        ...opts.Metadata,
      },
      ...opts,
    }).promise();
  }
  //#endregion
}

/**
 * Obtains the `VersionInfo` corresponding to the modified version(s) in the
 * provided `Change` objects, ensures they are relevant (construct libraries),
 * and returns those only.
 *
 * @param changes the changes to be processed.
 * @param metrics the metrics logger to use.
 * @param denyList deny list client
 *
 * @returns a list of `VersionInfo` objects
 */
function getRelevantVersionInfos(
  changes: readonly Change[],
  metrics: MetricsLogger,
  denyList: DenyListClient,
  licenseList: LicenseListClient,
  knownVersions: Map<string, Date>,
): readonly UpdatedVersion[] {

  const result = new Array<UpdatedVersion>();

  for (const change of changes) {
    // Filter out all elements that don't have a "name" in the document, as
    // these are schemas, which are not relevant to our business here.
    if (change.doc.name === undefined) {
      console.error(`[${change.seq}] Changed document contains no 'name': ${change.id}`);
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      continue;
    }

    // The normalize function change the object in place, if the doc object is invalid it will return undefined
    if (normalizeNPMMetadata(change.doc) === undefined) {
      console.error(`[${change.seq}] Changed document invalid, npm normalize returned undefined: ${change.id}`);
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      continue;
    }

    // Sometimes, there are no versions in the document. We skip those.
    if (change.doc.versions == null) {
      console.error(`[${change.seq}] Changed document contains no 'versions': ${change.id}`);
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      continue;
    }

    // Sometimes, there is no 'time' entry in the document. We skip those.
    if (change.doc.time == null) {
      console.error(`[${change.seq}] Changed document contains no 'time': ${change.id}`);
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      continue;
    }

    // Get the last modification date from the change
    const packageVersionUpdates = Object.entries(change.doc.time)
      // Ignore the "created" and "modified" keys here
      .filter(([key]) => key !== 'created' && key !== 'modified')
      // Parse all the dates to ensure they are comparable
      .map(([version, isoDate]) => [version, new Date(isoDate)] as const);
    metrics.putMetric(MetricName.PACKAGE_VERSION_COUNT, packageVersionUpdates.length, Unit.Count);

    for (const [version, modified] of packageVersionUpdates) {
      const knownKey = `${change.doc.name}@${version}`;
      const known = knownVersions.get(knownKey);
      if (known == null || known < modified) {
        const infos = change.doc.versions[version];
        if (infos == null) {
          // Could be the version in question was un-published.
          console.log(`[${change.seq}] Could not find info for "${change.doc.name}@${version}". Was it un-published?`);
        } else if (isConstructLibrary(infos)) {

          // skip if this package is denied
          const denied = denyList.lookup(infos.name, infos.version);
          if (denied) {
            console.log(`[${change.seq}] Package denied: ${JSON.stringify(denied)}`);
            knownVersions.set(knownKey, modified);
            metrics.putMetric(MetricName.DENY_LISTED_COUNT, 1, Unit.Count);
            continue;
          }

          metrics.putMetric(MetricName.PACKAGE_VERSION_AGE, Date.now() - modified.getTime(), Unit.Milliseconds);
          const isEligible = licenseList.lookup(infos.license ?? 'UNLICENSED') != null;
          metrics.putMetric(MetricName.INELIGIBLE_LICENSE, isEligible ? 0 : 1, Unit.Count);
          if (isEligible) {
            result.push({ infos, modified, seq: change.seq });
          } else {
            console.log(`[${change.seq}] Package "${change.doc.name}@${version}" does not use allow-listed license: ${infos.license ?? 'UNLICENSED'}`);
            knownVersions.set(knownKey, modified);
          }
        }
        // Else this is not a construct library, so we'll just ignore it...
      }
    }
  }
  return result;

  function isConstructLibrary(infos: VersionInfo): boolean {
    if (infos.jsii == null) {
      return false;
    }
    return infos.name === 'construct'
      || infos.name === 'aws-cdk-lib'
      || infos.name.startsWith('@aws-cdk')
      || infos.name === 'cdk8s'
      || /^cdk8s-plus-(17|20|21|22)$/.test(infos.name)
      || infos.keywords?.some((kw) => CONSTRUCT_KEYWORDS.has(kw))
      || Object.keys(infos.dependencies ?? {}).some(isConstructFrameworkPackage)
      || Object.keys(infos.devDependencies ?? {}).some(isConstructFrameworkPackage)
      || Object.keys(infos.peerDependencies ?? {}).some(isConstructFrameworkPackage);
  }

  /**
   * Package is one of the known construct framework's first party packages:
   * - @aws-cdk/*
   * - @cdktf/*
   * - cdk8s or cdk8s-plus
   */
  function isConstructFrameworkPackage(name: string): boolean {
    // NOTE: Prefix matching should only be used for @scope/ names.
    return name.startsWith('@aws-cdk/')
      || name.startsWith('@cdktf/')
      || name === 'cdk8s'
      || /^cdk8s-plus-(17|20|21|22)$/.test(name)
      || name === 'cdktf';
  }
}

/**
  * The scheme of a package version in the update. Includes the package.json keys, as well as some additional npm metadata
  * @see https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#version
  */
interface VersionInfo {
  readonly dependencies?: { readonly [name: string]: string };
  readonly devDependencies?: { readonly [name: string]: string };
  readonly peerDependencies?: { readonly [name: string]: string };
  readonly jsii: unknown;
  readonly license?: string;
  readonly name: string;
  readonly [key: string]: unknown;
  readonly keywords: string[];
  readonly dist: {
    readonly shasum: string;
    readonly tarball: string;
  };
  readonly version: string;
}

interface UpdatedVersion {
  /**
   * The `VersionInfo` for the modified package version.
   */
  readonly infos: VersionInfo;

  /**
   * The time at which the `VersionInfo` was last modified.
   */
  readonly modified: Date;

  /**
   * The CouchDB transaction number for the update.
   */
  readonly seq: number;
}

interface Document {

  /**
   * a List of all Version objects for the package
   */
  readonly versions: { [key:string]: VersionInfo | undefined };

  /**
   * The package's name.
   */
  readonly name: string;

  /**
   * Timestamps associated with this document. The values are ISO-8601 encoded
   * timestamps.
   */
  readonly time: {
    readonly created: string;
    readonly modified: string;
    readonly [version: string]: string;
  };
}

interface Change {
  readonly seq: number;
  readonly doc: Document;
  readonly id: string;
  readonly deleted: boolean;
}
