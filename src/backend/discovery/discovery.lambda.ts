import * as console from 'console';
import * as https from 'https';
import * as process from 'process';
import { URL } from 'url';

// eslint-disable-next-line import/no-unresolved
import type { Context } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as Nano from 'nano';

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
    throw new Error('The STAGING_BUCKET environment variable is not set');
  }
  stagingBucket = stagingBucket;

  if (!process.env.QUEUE_URL) {
    throw new Error('The NOTIFICATION_QUEUE_URL environment variable is not set');
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
    console.log(`Failed to load marker for bucket: ${stagingBucket}, will start read from latest`);
  }

  console.log(`Starting changes stream read from ${marker}`);

  const config: Nano.ChangesReaderOptions = {
    includeDocs: true,
    // pause the changes reader after each request
    wait: true,
    since: marker ?? 'now',
    // `changesReader.get` stops once a response with zero changes is received, however it waits too long
    //  since we want to terminate the Lambda function we define a timeout shorter than the default
    timeout: TIMEOUT_MILLISECONDS,
  };

  const nano = Nano(NPM_REPLICA_REGISTRY_URL);
  const db = nano.db.use('registry');

  db.changesReader.get(config)
    .on('batch', async (batch: Change[]) => {
      console.log(`Received a batch of ${batch.length} length`);
      const batchPromises = batch
        // ignores changes which are not package update, see https://github.com/cdklabs/construct-hub/issues/3#issuecomment-858246275
        .filter(change => change.doc.name)
        .map(change => {
          return processPackageUpdate(change, context)
            .catch(err => {
              Object.defineProperty(change, '_construct_hub_failure_reason', err);
              return s3!.putObject({
                Bucket: stagingBucket,
                Key: `${FAILED_CHANGE_PREFIX}/${change.id}`,
                Body: JSON.stringify(change, null, 2),
                Metadata: {
                  'Lambda-Log-Group': context.logGroupName,
                  'Lambda-Log-Stream': context.logStreamName,
                  'Lambda-Run-Id': context.awsRequestId,
                },
              }).promise().then(() => (void undefined));
            });
        });

      await Promise.all(batchPromises).then(function() {
        // write the last sequence to the marker file in S3
        const lastSequence = batch[batch.length - 1].seq;
        return writeMarkerToS3(lastSequence, context);
      }).then(function() {
        // resume reader
        (db.changesReader as any).resume();
      }).catch(function (error) {
        throw Error(`Error while processing batch, marker will not be updated, exiting.\n ${error}`);
      });
    })
    .on('end', () => {
      console.log('Changes feed monitoring has stopped');
    });
}

async function writeMarkerToS3(sequence: Number, context: Context) {
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
  let latestVersion: VersionInfo;
  try {
    // we assume that the change is concerning the latest version
    latestVersion = getLatestVersion(change);
    if (!isJsiiModule(latestVersion) || !isConstruct(latestVersion)) {
      return;
    }
  } catch (error) {
    console.error(`Could not parse change for ${change.id}`);
    throw error;
  }

  // change.dist.tarball => https://registry.npmjs.org/<@scope>/<name>/-/<name>-<version>.tgz
  // staging bucket key  => packages/<@scope>/<name>/-/<name>-<version>.tgz
  const key = `packages/${new URL(latestVersion.dist.tarball).pathname}`;
  await copyPackageToS3(latestVersion, key, context);
  await sendSqsMessage(latestVersion, change.seq, key);
}

/**
 * Copy the tarball from the npm registry to S3
*/
async function copyPackageToS3(versionInfo: VersionInfo, key: string, context: Context): Promise<void> {
  console.log(`uploading tarball to s3, key: ${key}`);
  return new Promise<void>((ok, ko) => {
    https.get(versionInfo.dist.tarball, function (response /* Readable */) {
      s3!.putObject({
        Bucket: stagingBucket,
        Key: key,
        Body: response,
        ContentType: 'application/x-gtar',
        Metadata: {
          'Lambda-Log-Group': context.logGroupName,
          'Lambda-Log-Stream': context.logStreamName,
          'Lambda-Run-Id': context.awsRequestId,
          'Origin-Uri': versionInfo.dist.tarball,
        },
      }).promise().then(() => ok(), ko);
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
async function sendSqsMessage(versionInfo: VersionInfo, transactionId: number, key: string): Promise<void> {
  console.log(`Posting sqs message for ${versionInfo.packageName}`);
  const message: Message = {
    tarballUri: `s3://${stagingBucket}/${key}`,
    metadata: { tid: transactionId.toFixed() },
    time: new Date(versionInfo.time.modified),
    integrity: 'TODO',
  };

  await sqs!.sendMessage({
    MessageBody: JSON.stringify(message, null, 2),
    QueueUrl: queueUrl,
  }).promise();
}

/**
  * @returns returns true if the package.json contains a jsii clause, false otherwise
  * @param pkgJason
  */
function isJsiiModule(pkgJason: VersionInfo): boolean {
  return pkgJason.jsii != null;
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
function getLatestVersion(update: Change): VersionInfo {
  const [lastModifiedVersion] = Object.entries(update.doc.time)
    // Ignore created & modified timestamps
    .filter(([key]) => key !== 'created' && key !== 'modified')
    // Sort by timestamp, descending
    .sort(([, ld], [, rd]) => new Date(rd).getTime() - new Date(ld).getTime())
    // First entry is most recently changed version
    [0];

  return update.doc.versions[lastModifiedVersion];
}

/**
  * This method applies different heuristics to check if this is a Construct
  * @param pkgJason
  * @returns
  */
function isConstruct(pkgJason: VersionInfo): boolean {
  // currently we only check for specific keywords
  return pkgJason.keywords?.some(k => CONSTRUCT_KEYWORDS.has(k));
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
  readonly time: {
    readonly modified: string;
    readonly created: string;
    readonly [key: string]: string;
  };
}

interface Document {

  /**
   * a List of all Version objects for the package
   */
  readonly versions: { [key:string]: VersionInfo };

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

interface Message {
  readonly tarballUri: string;
  readonly metadata?: { readonly [key: string]: string };
  readonly time: Date;
  readonly integrity: string;
}
