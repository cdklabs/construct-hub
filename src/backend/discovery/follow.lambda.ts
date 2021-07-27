import { metricScope, Configuration, MetricsLogger, Unit } from 'aws-embedded-metrics';
import Environments from 'aws-embedded-metrics/lib/environment/Environments';
import type { Context, ScheduledEvent } from 'aws-lambda';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Nano = require('nano');
import * as aws from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';
import { MetricName, METRICS_NAMESPACE, DISCOVERY_MARKER_KEY } from './constants';
import { UpdatedVersion, VersionInfo } from './version-info.lambda-shared';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const normalizeNPMMetadata = require('normalize-registry-metadata');

const TIMEOUT_MILLISECONDS = 10_000;
const CONSTRUCT_KEYWORDS: ReadonlySet<string> = new Set(['cdk', 'aws-cdk', 'cdk8s', 'cdktf']);
const NPM_REPLICA_REGISTRY_URL = 'https://replicate.npmjs.com/';

// Configure embedded metrics format
Configuration.environmentOverride = Environments.Lambda;
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
  const queueUrl = requireEnv('QUEUE_URL');

  const initialMarker = await loadLastTransactionMarker(1_800_000 /* @aws-cdk/cdk initial release was at 1_846_709 */);

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
    batchSize: 30,
  };

  const nano = Nano(NPM_REPLICA_REGISTRY_URL);
  const db = nano.db.use('registry');

  // We need to make an explicit Promise here, because otherwise Lambda won't
  // know when it's done...
  return new Promise<void>((ok, ko) => {

    let updatedMarker = initialMarker;

    db.changesReader.get(config)
      .on('batch', metricScope((metrics) => async (batch: readonly Change[]) => {
        // Clear automatically set dimensions - we don't need them (see https://github.com/awslabs/aws-embedded-metrics-node/issues/73)
        metrics.setDimensions();

        metrics.setProperty('StartSeq', updatedMarker);
        const startTime = Date.now();

        // Emit npm.js replication lag
        for (const { doc } of batch) {
          if (doc?.time?.modified) {
            metrics.putMetric(
              MetricName.NPMJS_CHANGE_AGE,
              startTime - new Date(doc.time.modified).getTime(),
              Unit.Milliseconds,
            );
          }
        }

        try {
          console.log(`Received a batch of ${batch.length} element(s)`);
          metrics.putMetric(MetricName.CHANGE_COUNT, batch.length, Unit.Count);
          const lastSeq = Math.max(...batch.map((change) => change.seq));
          metrics.setProperty('EndSeq', updatedMarker);

          // Obtain the modified package version from the update event, and filter
          // out packages that are not of interest to us (not construct libraries).
          const versionInfos = getRelevantVersionInfos(batch, metrics);
          console.log(`Identified ${versionInfos.length} relevant package version update(s)`);
          metrics.putMetric(MetricName.RELEVANT_PACKAGE_VERSIONS, versionInfos.length, Unit.Count);

          // Notify the staging & notification function
          await aws.sqsSendMessageBatch(queueUrl, versionInfos);

          // Update the transaction marker in S3.
          await saveLastTransactionMarker(context, stagingBucket, lastSeq);

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
            metrics.putMetric(MetricName.REMAINING_TIME, context.getRemainingTimeInMillis(), Unit.Milliseconds);
            ok();
          }
        } catch (err) {
          // An exception bubbled out, which means this Lambda execution has failed.
          console.error(`Unexpected error: ${err}`);
          db.changesReader.stop();
          ko(err);
        } finally {
          metrics.putMetric(MetricName.BATCH_PROCESSING_TIME, Date.now() - startTime, Unit.Milliseconds);
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
   async function loadLastTransactionMarker(defaultValue: number): Promise<number> {
    try {
      const response = await aws.s3().getObject({
        Bucket: stagingBucket,
        Key: DISCOVERY_MARKER_KEY,
      }).promise();
      const marker = Number.parseInt(response.Body!.toString('utf-8'), 10);
      console.log(`Read last transaction marker: ${marker}`);
      return marker;
    } catch (error) {
      if (error.code !== 'NoSuchKey') {
        throw error;
      }
      console.log(`Marker object (s3://${stagingBucket}/${DISCOVERY_MARKER_KEY}) does not exist, starting from the default (${defaultValue})`);
      return defaultValue;
    }
  }

 /**
   * Updates the last transaction marker in S3.
   *
   * @param sequence the last transaction marker value
   */
  async function saveLastTransactionMarker(context: Context, bucket: string, sequence: Number) {
    console.log(`Updating last transaction marker to ${sequence}`);
    return aws.s3PutObject(context, bucket, DISCOVERY_MARKER_KEY, sequence.toFixed(), { ContentType: 'text/plain; charset=UTF-8' });
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
      const sortedUpdates = Object.entries(change.doc.time)
        // Ignore the "created" and "modified" keys here
        .filter(([key]) => key !== 'created' && key !== 'modified')
        // Parse all the dates to ensure they are comparable
        .map(([version, isoDate]) => [version, new Date(isoDate)] as const)
        // Sort by date, descending
        .sort(([, l], [, r]) => r.getTime() - l.getTime());
      metrics.putMetric(MetricName.PACKAGE_VERSION_COUNT, sortedUpdates.length, Unit.Count);

      for (const [version, modified] of sortedUpdates) {
        const infos = change.doc.versions[version];
        if (infos == null) {
          // Could be the version in question was un-published.
          console.log(`[${change.seq}] Could not find info for "${change.doc.name}@${version}". Was it un-published?`);
        } else if (isRelevantPackageVersion(infos)) {
          metrics.putMetric(MetricName.PACKAGE_VERSION_AGE, Date.now() - modified.getTime(), Unit.Milliseconds);
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

