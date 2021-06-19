import * as console from 'console';
import * as https from 'https';
import { URL } from 'url';

// eslint-disable-next-line import/no-unresolved
import type { Context, ScheduledEvent } from 'aws-lambda';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Nano = require('nano');
import { aws, IngestionInput, integrity, requireEnv } from '../shared';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const normalizeNPMMetadata = require('normalize-registry-metadata');

const TIMEOUT_MILLISECONDS = 10_000;
const CONSTRUCT_KEYWORDS: ReadonlySet<string> = new Set(['cdk', 'aws-cdk', 'cdk8s', 'cdktf']);
const MARKER_FILE_NAME = 'couchdb-last-transaction-id';
const NPM_REPLICA_REGISTRY_URL = 'https://replicate.npmjs.com/';

export const FAILED_KEY_PREFIX = 'failed/';
export const STAGED_KEY_PREFIX = 'staged/';

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
  };

  const nano = Nano(NPM_REPLICA_REGISTRY_URL);
  const db = nano.db.use('registry');

  // We need to make an explicit Promise here, because otherwise Lambda won't
  // know when it's done...
  return new Promise((ok, ko) => {
    let updatedMarker = initialMarker;

    db.changesReader.get(config)
      .on('batch', async (batch: readonly Change[]) => {
        try {
          console.log(`Received a batch of ${batch.length} element(s)`);
          const lastSeq = Math.max(...batch.map((change) => change.seq));

          // Obtain the modified package version from the update event, and filter
          // out packages that are not of interest to us (not construct libraries).
          const versionInfos = getRelevantVersionInfos(batch);
          console.log(`Identified ${versionInfos.length} relevant package version update(s)`);

          // Process all remaining updates
          await Promise.all(versionInfos.map(processUpdatedVersion));

          // Update the transaction marker in S3.
          await saveLastTransactionMarker(lastSeq);
          updatedMarker = lastSeq;

          // If we have enough time left before timeout, proceed with the next batch, otherwise we're done here.
          if (context.getRemainingTimeInMillis() >= 120_000 /* 2 minutes */) {
            console.log('There is still time, requesting the next batch...');
            // Note: the `resume` function is missing from the `nano` type definitions, but is there...
            (db.changesReader as any).resume();
          } else {
            console.log('We are almost out of time, so stopping here.');
            db.changesReader.stop();
            ok({ initialMarker, updatedMarker });
          }
        } catch (err) {
          // An exception bubbled out, which means this Lambda execution has failed.
          console.error(`Unexpected error: ${err}`);
          db.changesReader.stop();
          ko(err);
        }
      })
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
    return putObject(MARKER_FILE_NAME, sequence.toFixed(), { ContentType: 'text/plain' });
  }
  //#endregion

  //#region Business Logic
  async function processUpdatedVersion({ infos, modified, seq }: UpdatedVersion): Promise<void> {
    try {
      // Download the tarball
      const tarball = await httpGet(infos.dist.tarball);

      // Store the tarball into the staging bucket
      // - infos.dist.tarball => https://registry.npmjs.org/<@scope>/<name>/-/<name>-<version>.tgz
      // - stagingKey         =>                     staged/<@scope>/<name>/-/<name>-<version>.tgz
      const stagingKey = `${STAGED_KEY_PREFIX}${new URL(infos.dist.tarball).pathname}`.replace(/\/{2,}/g, '/');
      await putObject(stagingKey, tarball, {
        ContentType: 'application/x-gtar',
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
    } catch (err) {
      // Something failed, store the payload in the problem prefix, and move on.
      console.error(`[${seq}] Failed processing, logging the error to s3 and resuming processing. ${infos.name}@${infos.version}: ${err}`);
      await putObject(`${FAILED_KEY_PREFIX}${seq}`, JSON.stringify({ ...infos, _construct_hub_failure_reason: err }, null, 2), {
        ContentType: 'text/json',
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
 *
 * @returns a list of `VersionInfo` objects
 */
function getRelevantVersionInfos(changes: readonly Change[]): readonly UpdatedVersion[] {
  const result = new Array<UpdatedVersion>();

  for (const change of changes) {
    // Filter out all elements that don't have a "name" in the document, as
    // these are schemas, which are not relevant to our business here.
    if (change.doc.name === undefined) {
      console.error(`[${change.seq}] Changed document contains no 'name': ${change.id}`);
      continue;
    }

    // The normalize function change the object in place, if the doc object is invalid it will return undefined
    if (normalizeNPMMetadata(change.doc) === undefined) {
      continue;
    }

    // Sometimes, there are no versions in the document. We skip those.
    if (change.doc.versions == null) {
      console.error(`[${change.seq}] Changed document contains no 'versions': ${change.id}`);
      continue;
    }

    // Sometimes, there is no 'time' entry in the document. We skip those.
    if (change.doc.time == null) {
      console.error(`[${change.seq}] Changed document contains no 'time': ${change.id}`);
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

    let latestModified: Date | undefined;
    for (const [version, modified] of sortedUpdates) {
      if (latestModified == null || latestModified.getTime() === modified.getTime()) {
        const infos = change.doc.versions[version];
        if (infos == null) {
          // Could be the version in question was un-published.
          console.log(`[${change.seq}] Could not find info for "${change.doc.name}@${version}". Was it un-published?`);
        } else if (isRelevantPackageVersion(infos)) {
          result.push({ infos, modified, seq: change.seq });
        } else {
          console.log(`[${change.seq}] Ignoring "${change.doc.name}@${version}" as it is not a construct library.`);
        }
        latestModified = modified;
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

/**
  * The scheme of a package version in the update. Includes the package.json keys, as well as some additional npm metadata
  * @see https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#version
  */
interface VersionInfo {
  readonly devDependencies: { readonly [name: string]: string };
  readonly dependencies: { readonly [name: string]: string };
  readonly jsii: unknown;
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
