import * as console from 'console';
import * as https from 'https';
import * as process from 'process';
import { URL } from 'url';

// eslint-disable-next-line import/no-unresolved
import type { Context } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as Nano from 'nano';
import { IngestionInput, integrity } from '../shared';

const TIMEOUT_MILLISECONDS = 10_000;
const CONSTRUCT_KEYWORDS: ReadonlySet<string> = new Set(['cdk', 'aws-cdk', 'cdk8s', 'cdktf']);
const MARKER_FILE_NAME = 'couchdb-last-transaction-id';
const NPM_REPLICA_REGISTRY_URL = 'https://replicate.npmjs.com/';

/**
 * The S3 prefix for storing change that we failed processing
 */
const FAILED_CHANGE_PREFIX = 'failed';

let s3: AWS.S3 | undefined;
let sqs: AWS.SQS | undefined;

let stagingBucket: string;
let queueUrl: string;

/**
 * This function triggers on a fixed schedule and reads a stream of changes frm npmjs couchdb _changes endpoint.
 * Upon invocation the function starts reading from a sequence stored in an s3 object - the `marker`.
 * If the marker fails to load (or do not exist), the stream will start from `now` - the latest change.
 * For each change:
 *  - the package version tarball will be copied from the npm registry to a stating bucket.
 *  - a message will be sent to an sqs queue
 * Currently we don't handle the function execution timeout, and accept that the last batch processed might be processed again,
 * relying on the idempotency on the consumer side.
 * npm registry API docs: https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md
 * @param context a Lambda execution context
 */
export async function handler(_request: unknown, context: Context) {
  if (s3 == null) {
    s3 = new AWS.S3();
  }
  if (sqs == null) {
    sqs = new AWS.SQS();
  }

  if (!process.env.STAGING_BUCKET_NAME) {
    throw new Error('The STAGING_BUCKET_NAME environment variable is not set');
  }
  stagingBucket = process.env.STAGING_BUCKET_NAME;

  if (!process.env.QUEUE_URL) {
    throw new Error('The QUEUE_URL environment variable is not set');
  }
  queueUrl = process.env.QUEUE_URL;

  // load marker from the staging bucket
  let marker;
  try {
    await s3.getObject({
      Bucket: stagingBucket,
      Key: MARKER_FILE_NAME,
    }).promise().then(function(data) {
      marker = data.Body?.toString('utf-8');
    });
  } catch (error) {
    throw new Error(`Failed to load marker for bucket: ${stagingBucket}, exiting`);
  }

  console.log(`Starting changes stream read from ${marker}`);

  const config: Nano.ChangesReaderOptions = {
    includeDocs: true,
    // pause the changes reader after each request
    wait: true,
    since: marker ?? '139369',
    // `changesReader.get` stops once a response with zero changes is received, however it waits too long
    //  since we want to terminate the Lambda function we define a timeout shorter than the default
    timeout: TIMEOUT_MILLISECONDS,
  };

  const nano = Nano(NPM_REPLICA_REGISTRY_URL);
  const db = nano.db.use('registry');

  db.changesReader.get(config)
    .on('batch', async (batch: readonly Change[]) => {
      console.log(`Received a batch of ${batch.length} element(s)`);
      const batchPromises = batch
        // ignores changes which are not package update, see https://github.com/cdklabs/construct-hub/issues/3#issuecomment-858246275
        .filter((change) => change.doc.name)
        .map((change) =>
          processPackageUpdate(change, context)
            .catch((err) =>
              s3!.putObject({
                Bucket: stagingBucket,
                Key: `${FAILED_CHANGE_PREFIX}/${change.id}`,
                Body: JSON.stringify({ ...change, _construct_hub_failure_reason: err }, null, 2),
                Metadata: {
                  'Lambda-Log-Group': context.logGroupName,
                  'Lambda-Log-Stream': context.logStreamName,
                  'Lambda-Run-Id': context.awsRequestId,
                },
              }).promise().then(() => (void undefined))));

      await Promise.all(batchPromises).then(function () {
        // write the last sequence to the marker file in S3
        const lastSequence = batch[batch.length - 1].seq;
        return writeMarkerToS3(lastSequence, context);
      }).then(
        // resume reader
        () => (db.changesReader as any).resume(),
      ).catch((error) => {
        db.changesReader.stop();
        return Promise.reject(new Error(`Error while processing batch, marker will not be updated, exiting.\n${error}`));
      });
    })
    .on('end', () => {
      console.log('Changes feed monitoring has stopped');
    });
}

async function writeMarkerToS3(sequence: Number, context: Context) {
  if (process.env.SKIP_MARKER) {
    return;
  }
  await s3!.putObject({
    Bucket: stagingBucket,
    Key: MARKER_FILE_NAME,
    Body: sequence.toString(),
    Metadata: {
      'Lambda-Log-Group': context.logGroupName,
      'Lambda-Log-Stream': context.logStreamName,
      'Lambda-Run-Id': context.awsRequestId,
    },
  }).promise();
}

async function processPackageUpdate(change: Change, context: Context) {
  console.log(`Processing transaction: ${change.seq}`);
  if (Object.keys(change.doc.versions).length === 0) {
    console.log(`Ignoring document ${change.id}, as it contains no versions`);
    return;
  }

  const [latestVersion, publishTime] = getLatestVersion(change);
  if (latestVersion == null || !isJsiiModule(latestVersion) || !isConstruct(latestVersion)) {
    console.log(`Ignoring document ${change.id}, as it is not relevant`);
    return;
  }

  // change.dist.tarball => https://registry.npmjs.org/<@scope>/<name>/-/<name>-<version>.tgz
  // staging bucket key  => packages/<@scope>/<name>/-/<name>-<version>.tgz
  const key = `packages/${new URL(latestVersion.dist.tarball).pathname}`;
  const tarball = await copyPackageToS3(latestVersion, key, context);
  await sendSqsMessage(latestVersion, tarball, publishTime, change.seq, key);
}

/**
 * Copy the tarball from the npm registry to S3
*/
async function copyPackageToS3(versionInfo: VersionInfo, key: string, context: Context): Promise<Buffer> {
  console.log(`uploading tarball to s3, key: ${key}`);
  return new Promise<Buffer>((ok, ko) => {
    https.get(versionInfo.dist.tarball, (response) => {
      const buffer = Buffer.from(response);
      s3!.putObject({
        Bucket: stagingBucket,
        Key: key,
        Body: buffer,
        ContentType: 'application/x-gtar',
        Metadata: {
          'Lambda-Log-Group': context.logGroupName,
          'Lambda-Log-Stream': context.logStreamName,
          'Lambda-Run-Id': context.awsRequestId,
          'Origin-Uri': versionInfo.dist.tarball,
        },
      }).promise().then(() => ok(buffer), ko);
    }).on('error', (error) => {
      console.error(`Error attempting to stage tarball in S3: ${error}`);
      ko(`Failed downloading file from ${versionInfo.dist.tarball}`);
    });
  });
}

/**
 * Send an SQS message to notify that a new version was published
 * @param versionInfo the version info
 * @param key the s3 key to which the tarball was uploaded
 */
async function sendSqsMessage(versionInfo: VersionInfo, tarball: Buffer, publishTime: Date, transactionId: number, key: string): Promise<void> {
  console.log(`Posting sqs message for ${versionInfo.packageName}`);
  const messageBase = {
    tarballUri: `s3://${stagingBucket}/${key}`,
    metadata: { tid: transactionId.toFixed() },
    time: publishTime.toUTCString(),
  };
  const message: IngestionInput = {
    ...messageBase,
    integrity: integrity(messageBase, tarball),
  };

  await sqs!.sendMessage({
    MessageBody: JSON.stringify(message, null, 2),
    QueueUrl: queueUrl,
  }).promise();
}

/**
  * @returns returns true if the package.json contains a jsii clause, false otherwise
  */
function isJsiiModule(versionInfo: VersionInfo): boolean {
  return versionInfo.jsii != null;
}

/**
 * Retrieves the version information that was updated in a specific document
 * change. This assumes only one version was updated in a given change, and that
 * the `times` entry in the `Change` object reflects that correctly.
 *
 * @param update the `Change` entry from which a version info is to be extracted.
 *
 * @returns the version from the versions array with the most recent
 *          modification timestamp.
 */
function getLatestVersion(update: Change): [VersionInfo | undefined, Date] {
  const [lastModifiedVersion] = Object.entries(update.doc.time)
    // Ignore created & modified timestamps
    .filter(([key]) => key !== 'created' && key !== 'modified')
    // Sort by timestamp, descending
    .sort(([, ld], [, rd]) => new Date(rd).getTime() - new Date(ld).getTime())
    // First entry is most recently changed version
    [0];

  return [
    update.doc.versions[lastModifiedVersion],
    new Date(update.doc.time[lastModifiedVersion]),
  ];
}

/**
  * This method applies different heuristics to check if this is a Construct
  * @param pkgJason
  * @returns
  */
function isConstruct(versionInfo: VersionInfo): boolean {
  // currently we only check for specific keywords
  return versionInfo.keywords?.some((k) => CONSTRUCT_KEYWORDS.has(k));
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