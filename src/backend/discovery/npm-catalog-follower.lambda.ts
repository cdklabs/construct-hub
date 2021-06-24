import * as console from 'console';

import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics';
import type { Context, ScheduledEvent } from 'aws-lambda';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Nano = require('nano');
import * as aws from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';
import { DISCOVERY_MARKER_KEY, METRIC_NAMESPACE, METRIC_NAME_BATCH_PROCESSING_TIME, METRIC_NAME_BATCH_SIZE, METRIC_NAME_NEW_PACKAGE_VERSIONS, METRIC_NAME_PACKAGE_VERSION_AGE, METRIC_NAME_RELEVANT_PACKAGE_VERSIONS, METRIC_NAME_REMAINING_TIME, METRIC_NAME_UNPROCESSABLE_ENTITY, RESET_BEACON_KEY } from './constants.lambda-shared';
import type { UpdatedVersion, VersionInfo } from './version-info.lambda-shared';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const normalizeNPMMetadata = require('normalize-registry-metadata');

const TIMEOUT_MILLISECONDS = 10_000;
const CONSTRUCT_KEYWORDS: ReadonlySet<string> = new Set(['cdk', 'aws-cdk', 'cdk8s', 'cdktf']);
const NPM_REPLICA_REGISTRY_URL = 'https://replicate.npmjs.com/';

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
  const queueUrl = requireEnv('QUEUE_URL');

  const marker = await loadLastTransactionMarker(1_800_000 /* @aws-cdk/cdk initial release was at 1_846_709 */);

  const config: Nano.ChangesReaderOptions = {
    includeDocs: true,
    // pause the changes reader after each request
    wait: true,
    since: marker.lastSeq.toFixed(),
    // `changesReader.get` stops once a response with zero changes is received, however it waits too long
    //  since we want to terminate the Lambda function we define a timeout shorter than the default
    timeout: TIMEOUT_MILLISECONDS,
    // Only items with a name
    selector: {
      name: { $gt: null },
    },
    batchSize: 30,
  };

  const nano = Nano(NPM_REPLICA_REGISTRY_URL);
  const db = nano.db.use('registry');

  // We need to make an explicit Promise here, because otherwise Lambda won't
  // know when it's done...
  return new Promise<void>((ok, ko) => {
    db.changesReader.get(config)
      .on('batch', metricScope((metrics) => async (batch: readonly Change[]) => {
        metrics.setNamespace(METRIC_NAMESPACE);
        const startTime = Date.now();
        try {
          console.log(`Received a batch of ${batch.length} element(s)`);
          metrics.putMetric(METRIC_NAME_BATCH_SIZE, batch.length, Unit.Count);
          const lastSeq = Math.max(...batch.map((change) => change.seq));

          // Obtain the modified package version from the update event, and filter
          // out packages that are not of interest to us (not construct libraries).
          const versionInfos = getRelevantVersionInfos(batch, metrics);
          console.log(`Identified ${versionInfos.length} relevant package version update(s)`);
          metrics.putMetric(METRIC_NAME_RELEVANT_PACKAGE_VERSIONS, versionInfos.length, Unit.Count);

          const newVersions = versionInfos.filter(({ infos, modified }) => {
            const key = `${infos.name}@${infos.version}`;
            if (marker.knownPackageVersions.has(key) && marker.knownPackageVersions.get(key)! >= modified) {
              // We already saw this package update, or a more recent one.
              return false;
            }
            marker.knownPackageVersions.set(key, modified);
            return true;
          });
          metrics.putMetric(METRIC_NAME_NEW_PACKAGE_VERSIONS, newVersions.length, Unit.Count);

          // Notify the staging & notification function
          await aws.sqsSendMessageBatch(queueUrl, newVersions);

          // Update the transaction marker in S3.
          await saveLastTransactionMarker(marker);
          marker.lastSeq = lastSeq;

          // If we have enough time left before timeout, proceed with the next batch, otherwise we're done here.
          // Since the distribution of the time it takes to process each package/batch is non uniform, this is a best
          // effort, and we expect the function to timeout in some invocations, we rely on the downstream idempotency to handle this.
          if (context.getRemainingTimeInMillis() >= 30_000 /* 30 seconds */) {
            console.log('There is still time, requesting the next batch...');
            // Note: the `resume` function is missing from the `nano` type definitions, but is there...
            (db.changesReader as any).resume();
          } else {
            console.log('We are almost out of time, so stopping here.');
            db.changesReader.stop();
            metrics.putMetric(METRIC_NAME_REMAINING_TIME, context.getRemainingTimeInMillis(), Unit.Milliseconds);
            ok();
          }
        } catch (err) {
          // An exception bubbled out, which means this Lambda execution has failed.
          console.error(`Unexpected error: ${err}`);
          db.changesReader.stop();
          ko(err);
        } finally {
          metrics.putMetric(METRIC_NAME_BATCH_PROCESSING_TIME, Date.now() - startTime, Unit.Milliseconds);
        }
      }))
      .once('end', () => {
        console.log('No more updates to process, exiting.');
        ok();
      });
  });

  //#region Last transaction marker
  /**
   * Loads the last transaction marker from S3.
   *
   * @param defaultValue the value to return in case the marker does not exist
   *
   * @returns the value of the last transaction marker.
   */
  async function loadLastTransactionMarker(defaultValue: number): Promise<Marker> {
    const resetObject = { Bucket: stagingBucket, Key: RESET_BEACON_KEY };
    const reset = await aws.s3().headObject(resetObject)
      .promise()
      .then(
        // Object was found => we were asked to reset
        () => true,
        // If the error was NotFound, then we were NOT asked to reset
        (err) => err.code === 'NotFound' ? Promise.resolve(false) : Promise.reject(err),
      );
    if (reset) {
      console.log(`Change Stream reset requested... Rolling back to ${defaultValue}`);
      await aws.s3().deleteObject(resetObject).promise();
      return { lastSeq: defaultValue, knownPackageVersions: new Map() };
    }

    try {
      const response = await aws.s3().getObject({
        Bucket: stagingBucket,
        Key: DISCOVERY_MARKER_KEY,
      }).promise();
      let result = JSON.parse(
        response.Body!.toString('utf-8'),
        (key, value) => {
          if (key !== 'knownPackageVersions' || typeof value !== 'object') {
            return value;
          }
          return Object.entries(value).reduce(
            (map, [pkg, time]) => map.set(pkg, new Date(time as number)),
            new Map<string, Date>(),
          );
        },
      ) as number | Marker;
      if (typeof result === 'number') {
        console.log('Migrating transaction marker to new format...');
        result = { lastSeq: result, knownPackageVersions: new Map() };
      }
      console.log(`Read last transaction marker: ${result.lastSeq}`);
      return result;
    } catch (error) {
      if (error.code !== 'NoSuchKey') {
        throw error;
      }
      console.log(`Marker object (s3://${stagingBucket}/${DISCOVERY_MARKER_KEY}) does not exist, starting from the default (${defaultValue})`);
      return { lastSeq: defaultValue, knownPackageVersions: new Map() };
    }
  }

  /**
   * Updates the last transaction marker in S3.
   *
   * @param sequence the last transaction marker value
   */
  async function saveLastTransactionMarker(newMarker: Marker) {
    console.log(`Updating last transaction marker to ${newMarker.lastSeq}`);
    return aws.s3PutObject(
      context,
      stagingBucket,
      DISCOVERY_MARKER_KEY,
      JSON.stringify(
        newMarker,
        (key, value) => {
          if (key !== 'knownPackageVersions') {
            return value;
          }
          const obj = Object.create(null);
          for (const [pkg, date] of (value as Map<string, Date>).entries()) {
            obj[pkg] = date.getTime();
          }
          return obj;
        },
        2,
      ),
      { ContentType: 'text/json' },
    );
  }
  //#endregion
}

/**
 * Obtains the `VersionInfo` corresponding to the modified version(s) in the
 * provided `Change` objects, ensures they are relevant (construct libraries),
 * and returns those only.
 *
 * @param changes the changes to be processed.
 *
 * @returns a list of `VersionInfo` objects
 */
function getRelevantVersionInfos(changes: readonly Change[], metrics: MetricsLogger): readonly UpdatedVersion[] {
  const result = new Array<UpdatedVersion>();

  for (const change of changes) {
    // Filter out all elements that don't have a "name" in the document, as
    // these are schemas, which are not relevant to our business here.
    if (change.doc.name === undefined) {
      console.error(`[${change.seq}] Changed document contains no 'name': ${change.id}`);
      metrics.putMetric(METRIC_NAME_UNPROCESSABLE_ENTITY, 1, Unit.Count);
      continue;
    }

    // The normalize function change the object in place, if the doc object is invalid it will return undefined
    if (normalizeNPMMetadata(change.doc) === undefined) {
      console.error(`[${change.seq}] Changed document invalid, npm normalize returned undefined: ${change.id}`);
      metrics.putMetric(METRIC_NAME_UNPROCESSABLE_ENTITY, 1, Unit.Count);
      continue;
    }

    // Sometimes, there are no versions in the document. We skip those.
    if (change.doc.versions == null) {
      console.error(`[${change.seq}] Changed document contains no 'versions': ${change.id}`);
      metrics.putMetric(METRIC_NAME_UNPROCESSABLE_ENTITY, 1, Unit.Count);
      continue;
    }

    // Sometimes, there is no 'time' entry in the document. We skip those.
    if (change.doc.time == null) {
      console.error(`[${change.seq}] Changed document contains no 'time': ${change.id}`);
      metrics.putMetric(METRIC_NAME_UNPROCESSABLE_ENTITY, 1, Unit.Count);
      continue;
    }

    // Get the last modification date from the change
    const sortedUpdates = Object.entries(change.doc.time)
      // Ignore the "created" and "modified" keys here
      .filter(([key]) => key !== 'created' && key !== 'modified')
      // Parse all the dates to ensure they are comparable
      .map(([version, isoDate]) => [version, new Date(isoDate)] as const)
      // Sort by date, descending
      .sort(([, l], [, r]) => r.getTime() - l.getTime());

    for (const [version, modified] of sortedUpdates) {
      const infos = change.doc.versions[version];
      if (infos == null) {
        // Could be the version in question was un-published.
        console.log(`[${change.seq}] Could not find info for "${change.doc.name}@${version}". Was it un-published?`);
      } else if (isRelevantPackageVersion(infos)) {
        metrics.putMetric(METRIC_NAME_PACKAGE_VERSION_AGE, Date.now() - modified.getTime(), Unit.Milliseconds);
        result.push({ infos, modified, seq: change.seq });
      } else {
        console.log(`[${change.seq}] Ignoring "${change.doc.name}@${version}" as it is not a construct library.`);
      }
    }
  }

  return result;

  function isRelevantPackageVersion(infos: VersionInfo): boolean {
    if (infos.jsii == null) {
      return false;
    }
    return infos.name === 'construct'
      || infos.name === 'aws-cdk-lib'
      || infos.name.startsWith('@aws-cdk')
      || infos.keywords?.some((kw) => CONSTRUCT_KEYWORDS.has(kw));
  }
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

interface Marker {
  lastSeq: number;
  knownPackageVersions: Map<string, Date>;
}
