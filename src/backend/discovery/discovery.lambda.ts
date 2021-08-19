import * as console from 'console';
import * as https from 'https';
import { URL } from 'url';

import { metricScope, Configuration, MetricsLogger, Unit } from 'aws-embedded-metrics';
import Environments from 'aws-embedded-metrics/lib/environment/Environments';
import type { Context, ScheduledEvent } from 'aws-lambda';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Nano = require('nano');
import { DenyListClient } from '../deny-list/client.lambda-shared';
import { LicenseListClient } from '../license-list/client.lambda-shared';
import * as aws from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';
import { IngestionInput } from '../shared/ingestion-input.lambda-shared';
import { integrity } from '../shared/integrity.lambda-shared';
import { MetricName, METRICS_NAMESPACE, S3KeyPrefix } from './constants.lambda-shared';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const normalizeNPMMetadata = require('normalize-registry-metadata');

const TIMEOUT_MILLISECONDS = 10_000;
const CONSTRUCT_KEYWORDS: ReadonlySet<string> = new Set(['cdk', 'aws-cdk', 'cdk8s', 'cdktf']);
const MARKER_FILE_NAME = 'couchdb-last-transaction-id.2';
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

  const denyList = await DenyListClient.newClient();
  const licenseList = await LicenseListClient.newClient();

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
  return new Promise((ok, ko) => {
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
          const versionInfos = getRelevantVersionInfos(batch, metrics, denyList, licenseList);
          console.log(`Identified ${versionInfos.length} relevant package version update(s)`);
          metrics.putMetric(MetricName.RELEVANT_PACKAGE_VERSIONS, versionInfos.length, Unit.Count);

          // Process all remaining updates
          await Promise.all(versionInfos.map(async (infos) => {
            const before = Date.now();
            await processUpdatedVersion(infos, metrics);
            metrics.putMetric(MetricName.STAGING_TIME, Date.now() - before, Unit.Milliseconds);
          }));

          // Update the transaction marker in S3.
          await saveLastTransactionMarker(lastSeq);
          updatedMarker = lastSeq;

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
            ok({ initialMarker, updatedMarker });
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
        ok({ initialMarker, updatedMarker });
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
        Key: MARKER_FILE_NAME,
      }).promise();
      const marker = Number.parseInt(response.Body!.toString('utf-8'), 10);
      console.log(`Read last transaction marker: ${marker}`);
      return marker;
    } catch (error) {
      if (error.code !== 'NoSuchKey') {
        throw error;
      }
      console.log(`Marker object (s3://${stagingBucket}/${MARKER_FILE_NAME}) does not exist, starting from the default (${defaultValue})`);
      return defaultValue;
    }
  }

  /**
   * Updates the last transaction marker in S3.
   *
   * @param sequence the last transaction marker value
   */
  async function saveLastTransactionMarker(sequence: Number) {
    console.log(`Updating last transaction marker to ${sequence}`);
    return putObject(MARKER_FILE_NAME, sequence.toFixed(), { ContentType: 'text/plain; charset=UTF-8' });
  }
  //#endregion

  //#region Business Logic
  async function processUpdatedVersion({ infos, modified, seq }: UpdatedVersion, metrics: MetricsLogger): Promise<void> {
    try {
      // Download the tarball
      const tarball = await httpGet(infos.dist.tarball);

      // Store the tarball into the staging bucket
      // - infos.dist.tarball => https://registry.npmjs.org/<@scope>/<name>/-/<name>-<version>.tgz
      // - stagingKey         =>                     staged/<@scope>/<name>/-/<name>-<version>.tgz
      const stagingKey = `${S3KeyPrefix.STAGED_KEY_PREFIX}${new URL(infos.dist.tarball).pathname}`.replace(/\/{2,}/g, '/');
      await putObject(stagingKey, tarball, {
        ContentType: 'application/octet-stream',
        Metadata: {
          'Modified-At': modified.toISOString(),
          'Origin-Integrity': infos.dist.shasum,
          'Origin-URI': infos.dist.tarball,
          'Sequence': seq.toFixed(),
        },
      });

      // Prepare SQS message for ingestion
      const messageBase = {
        tarballUri: `s3://${stagingBucket}/${stagingKey}`,
        metadata: {
          dist: infos.dist.tarball,
          seq: seq.toFixed(),
        },
        time: modified.toUTCString(),
      };
      const message: IngestionInput = {
        ...messageBase,
        integrity: integrity(messageBase, tarball),
      };

      // Send the SQS message out
      await aws.sqs().sendMessage({
        MessageBody: JSON.stringify(message, null, 2),
        QueueUrl: queueUrl,
      }).promise();

      metrics.putMetric(MetricName.STAGING_FAILURE_COUNT, 0, Unit.Count);
    } catch (err) {
      // Something failed, store the payload in the problem prefix, and move on.
      console.error(`[${seq}] Failed processing, logging error to S3 and resuming work. ${infos.name}@${infos.version}: ${err}`);
      metrics.putMetric(MetricName.STAGING_FAILURE_COUNT, 1, Unit.Count);
      await putObject(`${S3KeyPrefix.FAILED_KEY_PREFIX}${seq}`, JSON.stringify({ ...infos, _construct_hub_failure_reason: err }, null, 2), {
        ContentType: 'application/json',
        Metadata: {
          'Modified-At': modified.toISOString(),
        },
      });
    }
  }
  //#endregion

  //#region Asynchronous Primitives
  /**
   * Makes an HTTP GET request, and returns the resulting payload.
   *
   * @param url the URL to get.
   *
   * @returns a Buffer containing the received data.
   */
  function httpGet(url: string) {
    return new Promise<Buffer>((ok, ko) => {
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          throw new Error(`Unsuccessful GET: ${response.statusCode} - ${response.statusMessage}`);
        }

        let body = Buffer.alloc(0);
        response.on('data', (chunk) => body = Buffer.concat([body, Buffer.from(chunk)]));
        response.once('close', () => ok(body));
        response.once('error', ko);
      });
    });
  }

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
    const sortedUpdates = Object.entries(change.doc.time)
      // Ignore the "created" and "modified" keys here
      .filter(([key]) => key !== 'created' && key !== 'modified')
      // Parse all the dates to ensure they are comparable
      .map(([version, isoDate]) => [version, new Date(isoDate)] as const)
      // Sort by date, descending
      .sort(([, l], [, r]) => r.getTime() - l.getTime());
    metrics.putMetric(MetricName.PACKAGE_VERSION_COUNT, sortedUpdates.length, Unit.Count);

    let latestModified: Date | undefined;
    for (const [version, modified] of sortedUpdates) {
      if (latestModified == null || latestModified.getTime() === modified.getTime()) {
        const infos = change.doc.versions[version];
        if (infos == null) {
          // Could be the version in question was un-published.
          console.log(`[${change.seq}] Could not find info for "${change.doc.name}@${version}". Was it un-published?`);
        } else if (isConstructLibrary(infos)) {

          // skip if this package is denied
          const denied = denyList.lookup(infos.name, infos.version);
          if (denied) {
            console.log(`[${change.seq}] Package denied: ${JSON.stringify(denied)}`);
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
          }
        } else {
          console.log(`[${change.seq}] Ignoring "${change.doc.name}@${version}" as it is not a construct library.`);
        }
        latestModified = modified;
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
      || infos.keywords?.some((kw) => CONSTRUCT_KEYWORDS.has(kw));
  }
}

/**
  * The scheme of a package version in the update. Includes the package.json keys, as well as some additional npm metadata
  * @see https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#version
  */
interface VersionInfo {
  readonly devDependencies: { readonly [name: string]: string };
  readonly dependencies: { readonly [name: string]: string };
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
