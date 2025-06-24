import * as console from 'console';
import { InvokeCommand } from '@aws-sdk/client-lambda';
import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import type {
  NodeJsRuntimeStreamingBlobPayloadOutputTypes,
  StreamingBlobPayloadInputTypes,
} from '@smithy/types';
import {
  metricScope,
  Configuration,
  MetricsLogger,
  Unit,
} from 'aws-embedded-metrics';
import type { Context, ScheduledEvent } from 'aws-lambda';
import { captureHTTPsGlobal } from 'aws-xray-sdk-core';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import {
  MetricName,
  MARKER_FILE_NAME,
  METRICS_NAMESPACE,
  KNOWN_VERSIONS_FILE_NAME,
} from './constants.lambda-shared';
import { CouchChanges, DatabaseChange } from './couch-changes.lambda-shared';
import { PackageVersion } from './stage-and-notify.lambda';
import { DenyListClient } from '../../backend/deny-list/client.lambda-shared';
import { LicenseListClient } from '../../backend/license-list/client.lambda-shared';
import {
  LAMBDA_CLIENT,
  S3_CLIENT,
} from '../../backend/shared/aws.lambda-shared';
import { decompressContent } from '../../backend/shared/compress-content.lambda-shared';
import { requireEnv } from '../../backend/shared/env.lambda-shared';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const normalizeNPMMetadata = require('normalize-registry-metadata');

const CONSTRUCT_KEYWORDS: ReadonlySet<string> = new Set([
  'cdk',
  'aws-cdk',
  'awscdk',
  'cdk8s',
  'cdktf',
]);
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

// Make sure X-Ray traces will include HTTP(s) calls.
// eslint-disable-next-line @typescript-eslint/no-require-imports
captureHTTPsGlobal(require('https'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
captureHTTPsGlobal(require('http'));

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

  const npm = new CouchChanges(NPM_REPLICA_REGISTRY_URL, 'registry/_changes');

  const {
    marker: initialMarker,
    knownVersions,
    didLoadVersionsFromLegacy,
  } = await loadFollowerPosition(stagingBucket, npm);

  // If we loaded from the old location, write to the new
  let writeKnownVersionsFile = didLoadVersionsFromLegacy;

  // The last written marker seq id.
  let updatedMarker = initialMarker;

  // The slowest batch processing time so far (starts at 30 seconds). This is how much time should
  // be left before timeout if a new batch is to be fetched.
  let maxBatchProcessingTime = 30_000;
  // Whether we should continue reading more items or not... This is set to false when the current
  // latest change is reached (i.e: next page of changes is empty).
  let shouldContinue = true;

  do {
    await metricScope((metrics) => async () => {
      console.log('Polling changes from npm replica');
      const changes = await npm.changes(updatedMarker);

      // Clear automatically set dimensions - we don't need them (see https://github.com/awslabs/aws-embedded-metrics-node/issues/73)
      metrics.setDimensions({});

      // Recording current seq range and updating the `updatedMarker`.
      metrics.setProperty('StartSeq', updatedMarker);
      updatedMarker = Number(changes.last_seq);
      metrics.setProperty('EndSeq', updatedMarker);

      const startTime = Date.now();

      try {
        const batch = changes.actionableResults as readonly Change[];

        // The most recent "modified" timestamp observed in the batch.
        let lastModified: Date | undefined;
        // Emit npm.js replication lag
        for (const { doc } of batch) {
          if (doc?.time?.modified) {
            const modified = new Date(doc.time.modified);
            metrics.putMetric(
              MetricName.NPMJS_CHANGE_AGE,
              startTime - modified.getTime(),
              Unit.Milliseconds
            );
            if (lastModified == null || lastModified < modified) {
              lastModified = modified;
            }
          }
        }

        console.log(`Received a batch of ${batch.length} element(s)`);
        metrics.putMetric(MetricName.CHANGE_COUNT, batch.length, Unit.Count);

        if (lastModified && lastModified < DAWN_OF_CONSTRUCTS) {
          console.log(
            `Skipping batch as the latest modification is ${lastModified}, which is pre-Constructs`
          );
        } else if (changes.totalCount === 0) {
          console.log('Received 0 changes, caught up to "now", exiting...');
          shouldContinue = false;
        } else {
          // Obtain the modified package version from the update event, and filter
          // out packages that are not of interest to us (not construct libraries).
          const versionInfos = getRelevantVersionInfos(
            batch,
            metrics,
            denyList,
            licenseList,
            knownVersions
          );
          console.log(
            `Identified ${versionInfos.length} relevant package version update(s)`
          );
          metrics.putMetric(
            MetricName.RELEVANT_PACKAGE_VERSIONS,
            versionInfos.length,
            Unit.Count
          );

          // If we have versionInfos, we already added them to the knownVersions map and we should save it again
          writeKnownVersionsFile ||= versionInfos.length > 0;

          // Process all remaining updates
          await Promise.all(
            versionInfos.map(async ({ infos, modified, seq }) => {
              const invokeArgs: PackageVersion = {
                integrity: infos.dist.shasum,
                modified: modified.toISOString(),
                name: infos.name,
                seq: seq?.toString(),
                tarballUrl: infos.dist.tarball,
                version: infos.version,
              };
              // "Fire-and-forget" invocation here.
              console.log(`Sending ${invokeArgs.tarballUrl} for staging`);
              await LAMBDA_CLIENT.send(
                new InvokeCommand({
                  FunctionName: stagingFunction,
                  InvocationType: 'Event',
                  Payload: Buffer.from(JSON.stringify(invokeArgs)),
                })
              );
              // Record that this is now a "known" version (no need to re-discover)
              knownVersions.set(`${infos.name}@${infos.version}`, modified);
            })
          );
        }

        // Updating the S3 stored marker with the new seq id and known versions concurrently
        await Promise.all([
          // always save the transaction marker
          saveLastTransactionMarker(context, stagingBucket, updatedMarker),
          // conditionally save known versions
          ...(writeKnownVersionsFile
            ? [saveLastKnownVersions(context, stagingBucket, knownVersions)]
            : []),
        ]);
      } finally {
        metrics.putMetric(MetricName.LAST_SEQ, updatedMarker, Unit.None);
        metrics.putMetric(
          MetricName.BATCH_PROCESSING_TIME,
          Date.now() - startTime,
          Unit.Milliseconds
        );
        metrics.putMetric(
          MetricName.REMAINING_TIME,
          context.getRemainingTimeInMillis(),
          Unit.Milliseconds
        );
      }
    })();
  } while (
    shouldContinue &&
    context.getRemainingTimeInMillis() >= maxBatchProcessingTime
  );

  console.log('All done here, we have success!');

  return { initialMarker, updatedMarker };
}

//#region Last known versions and marker
/**
 * Common function to load data from an S3 file with error handling
 *
 * @param stagingBucket The S3 bucket name
 * @param key The file key in the bucket
 * @param warningMessage Message to log when file doesn't exist
 * @returns The decompressed file content as string, or null if file doesn't exist
 */
async function loadContentFromS3(
  stagingBucket: string,
  key: string,
  warningMessage: string
): Promise<string | null> {
  try {
    const response = await S3_CLIENT.send(
      new GetObjectCommand({
        Bucket: stagingBucket,
        Key: key,
      })
    );
    if (!response.Body) {
      throw new Error(`Response Body for ${key} is empty`);
    }
    return await decompressContent(
      response.Body as NodeJsRuntimeStreamingBlobPayloadOutputTypes,
      response.ContentEncoding
    );
  } catch (error: any) {
    if (error instanceof NoSuchKey || error.name === 'NoSuchKey') {
      console.warn(warningMessage);
      return null;
    }
    // re-throw unexpected errors
    throw error;
  }
}

async function loadFollowerPosition(
  stagingBucket: string,
  registry: CouchChanges
): Promise<{
  marker: number;
  knownVersions: Map<string, Date>;
  didLoadVersionsFromLegacy: boolean;
}> {
  const [markerFile, knownVersions] = await Promise.all([
    loadLastTransactionMarker(stagingBucket, registry),
    loadLastKnownVersions(stagingBucket),
  ]);

  if (!knownVersions) {
    // For legacy reasons, knownVersions could come from the transaction marker file
    // If it does, then we take that as knownVersions but will migrate knownVersions
    // to the modern file location
    return {
      marker: markerFile.marker,
      knownVersions: markerFile.knownVersions ?? new Map(),
      didLoadVersionsFromLegacy: true,
    };
  }

  return {
    marker: markerFile.marker,
    knownVersions,
    didLoadVersionsFromLegacy: false,
  };
}

/**
 * Loads the last known versions from S3.
 *
 * @returns the value of the last known versions.
 */
async function loadLastKnownVersions(
  stagingBucket: string
): Promise<Map<string, Date> | undefined> {
  const warningMessage = `Known versions object (s3://${stagingBucket}/${KNOWN_VERSIONS_FILE_NAME}) does not exist, starting from scratch`;
  const content = await loadContentFromS3(
    stagingBucket,
    KNOWN_VERSIONS_FILE_NAME,
    warningMessage
  );

  // Known Versions does not exist, starting from scratch
  if (content === null) {
    return undefined;
  }

  // Known Versions exists, generating map from the data
  const contentsObj: KnownVersionsFileSchema = JSON.parse(content);

  console.log(`Loaded last known versions data`);

  return dateMapFromObj(contentsObj.knownVersions);
}

/**
 * Loads the last transaction marker from S3.
 *
 * @param registry a Nano database corresponding to the Npmjs.com CouchDB instance.
 *
 * @returns the value of the last transaction marker.
 */
async function loadLastTransactionMarker(
  stagingBucket: string,
  registry: CouchChanges
): Promise<{ marker: number; knownVersions?: Map<string, Date> }> {
  const warningMessage = `Marker object (s3://${stagingBucket}/${MARKER_FILE_NAME}) does not exist, starting from scratch`;
  const content = await loadContentFromS3(
    stagingBucket,
    MARKER_FILE_NAME,
    warningMessage
  );

  // Last transaction marker does not exist
  if (content === null) {
    return { marker: 0 };
  }

  const parsedFile: MarkerFileSchema = JSON.parse(content);

  let marker: number;
  let knownVersions: Map<string, Date> | undefined;
  if (typeof parsedFile === 'number') {
    marker = parsedFile;
  } else {
    marker = Number(parsedFile.marker);
    knownVersions = parsedFile.knownVersions
      ? dateMapFromObj(parsedFile.knownVersions)
      : undefined;
  }

  // amazonq-ignore-next-line
  console.log(`Read last transaction marker: ${marker}`);

  const dbUpdateSeq = Number((await registry.info()).update_seq);
  if (dbUpdateSeq < marker) {
    console.warn(
      `Current DB update_seq (${dbUpdateSeq}) is lower than marker (CouchDB instance was likely replaced), resetting to 0!`
    );
    return { marker: 0 };
  }

  return { marker, knownVersions };
}

/**
 * Updates the last known versions in S3.
 *
 * @param knownVersions the map of package name + version to last modified timestamp of packages that have been processed.
 */
async function saveLastKnownVersions(
  context: Context,
  stagingBucket: string,
  knownVersions: Map<string, Date>
) {
  const contentsObj: KnownVersionsFileSchema = {
    knownVersions: objFromDateMap(knownVersions),
  };

  console.log(`Known versions changed, updating...`);
  await putObject(
    context,
    stagingBucket,
    KNOWN_VERSIONS_FILE_NAME,
    JSON.stringify(contentsObj, undefined, 2),
    {
      ContentType: 'application/json',
    }
  );
  console.log('Successfully updated known versions');
}

/**
 * Updates the last transaction marker in S3.
 *
 * @param marker the last transaction marker value
 */
async function saveLastTransactionMarker(
  context: Context,
  stagingBucket: string,
  marker: number
) {
  const contents = JSON.stringify({ marker });
  console.log(`Updating last transaction marker to ${marker}`);
  await putObject(context, stagingBucket, MARKER_FILE_NAME, contents, {
    ContentType: 'application/json',
  });
  console.log('Successfully updated marker');
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
function putObject(
  context: Context,
  bucket: string,
  key: string,
  body: StreamingBlobPayloadInputTypes,
  opts: Omit<PutObjectCommandInput, 'Bucket' | 'Key' | 'Body'> = {}
) {
  return S3_CLIENT.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      Metadata: {
        'Lambda-Log-Group': context.logGroupName,
        'Lambda-Log-Stream': context.logStreamName,
        'Lambda-Run-Id': context.awsRequestId,
        ...opts.Metadata,
      },
      ...opts,
    })
  );
}
//#endregion

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
  knownVersions: Map<string, Date>
): readonly UpdatedVersion[] {
  const result = new Array<UpdatedVersion>();

  for (const change of changes) {
    // Filter out all elements that don't have a "name" in the document, as
    // these are schemas, which are not relevant to our business here.
    if (change.doc.name === undefined) {
      console.error(
        `[${change.seq}] Changed document contains no 'name': ${change.id}`
      );
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      continue;
    }

    // The normalize function change the object in place, if the doc object is invalid it will return undefined
    if (normalizeNPMMetadata(change.doc) === undefined) {
      console.error(
        `[${change.seq}] Changed document invalid, npm normalize returned undefined: ${change.id}`
      );
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      continue;
    }

    // Sometimes, there are no versions in the document. We skip those.
    if (change.doc.versions == null) {
      console.error(
        `[${change.seq}] Changed document contains no 'versions': ${change.id}`
      );
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      continue;
    }

    // Sometimes, there is no 'time' entry in the document. We skip those.
    if (change.doc.time == null) {
      console.error(
        `[${change.seq}] Changed document contains no 'time': ${change.id}`
      );
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      continue;
    }

    // Get the last modification date from the change
    const packageVersionUpdates = Object.entries(change.doc.time)
      // Ignore the "created" and "modified" keys here
      .filter(([key]) => key !== 'created' && key !== 'modified')
      // Parse all the dates to ensure they are comparable
      .map(([version, isoDate]) => [version, new Date(isoDate)] as const);
    metrics.putMetric(
      MetricName.PACKAGE_VERSION_COUNT,
      packageVersionUpdates.length,
      Unit.Count
    );

    for (const [version, modified] of packageVersionUpdates) {
      const knownKey = `${change.doc.name}@${version}`;
      const known = knownVersions.get(knownKey);
      if (known == null || known < modified) {
        const infos = change.doc.versions[version];
        if (infos == null) {
          // Could be the version in question was un-published.
          console.log(
            `[${change.seq}] Could not find info for "${change.doc.name}@${version}". Was it un-published?`
          );
        } else if (isConstructLibrary(infos)) {
          // skip if this package is denied
          const denied = denyList.lookup(infos.name, infos.version);
          if (denied) {
            console.log(
              `[${change.seq}] Package denied: ${JSON.stringify(denied)}`
            );
            knownVersions.set(knownKey, modified);
            metrics.putMetric(MetricName.DENY_LISTED_COUNT, 1, Unit.Count);
            continue;
          }

          metrics.putMetric(
            MetricName.PACKAGE_VERSION_AGE,
            Date.now() - modified.getTime(),
            Unit.Milliseconds
          );
          const isEligible =
            licenseList.lookup(infos.license ?? 'UNLICENSED') != null;
          metrics.putMetric(
            MetricName.INELIGIBLE_LICENSE,
            isEligible ? 0 : 1,
            Unit.Count
          );
          if (isEligible) {
            result.push({ infos, modified, seq: change.seq });
          } else {
            console.log(
              `[${change.seq}] Package "${
                change.doc.name
              }@${version}" does not use allow-listed license: ${
                infos.license ?? 'UNLICENSED'
              }`
            );
            knownVersions.set(knownKey, modified);
          }
        }
        // Else this is not a construct library, so we'll just ignore it...
      }
    }
  }
  return result;

  /**
   * This determines whether a package is "interesting" to ConstructHub or not. This is related but
   * not necessarily identical to the logic in the ingestion process that annotates package metadata
   * with a construct framework name + version (those could ultimately be re-factored to share more
   * of the logic/heuristics, though).
   *
   * Concretely, it checks for a list of known "official" packages for various construct frameworks,
   * and packages that have a dependency on such a package. It also has a keywords allow-list as a
   * fall-back (the current dependency-based logic does not consider transitive dependencies and
   * might hence miss certain rare use-cases, which keywords would rescue).
   */
  function isConstructLibrary(infos: VersionInfo): boolean {
    if (infos.jsii == null) {
      return false;
    }
    // The "constructs" package is a sign of a constructs library
    return (
      isConstructFrameworkPackage(infos.name) ||
      // Recursively apply on dependencies
      Object.keys(infos.dependencies ?? {}).some(isConstructFrameworkPackage) ||
      Object.keys(infos.devDependencies ?? {}).some(
        isConstructFrameworkPackage
      ) ||
      Object.keys(infos.peerDependencies ?? {}).some(
        isConstructFrameworkPackage
      ) ||
      // Keyword-based fallback
      infos.keywords?.some((kw) => CONSTRUCT_KEYWORDS.has(kw))
    );
  }

  /**
   * Package is one of the known construct framework's first party packages:
   * - @aws-cdk/*
   * - @cdktf/*
   * - cdk8s or cdk8s-plus
   */
  function isConstructFrameworkPackage(name: string): boolean {
    // IMPORTANT NOTE: Prefix matching should only be used for @scope/ names.

    // The low-level constructs package
    return (
      name === 'constructs' ||
      // AWS CDK Packages
      name === 'aws-cdk-lib' ||
      name === 'monocdk' ||
      name.startsWith('@aws-cdk/') ||
      // CDK8s packages
      name === 'cdk8s' ||
      /^cdk8s-plus(?:-(?:17|20|21|22))?$/.test(name) ||
      // CDKTf packages
      name === 'cdktf' ||
      name.startsWith('@cdktf/')
    );
  }
}

function objFromDateMap(xs: Map<string, Date>): Record<string, string> {
  return Object.fromEntries(
    Array.from(xs).map(([k, v]) => [k, v.toISOString()])
  );
}

function dateMapFromObj(
  xs: Record<string, string | number>
): Map<string, Date> {
  return new Map(Object.entries(xs).map(([k, v]) => [k, new Date(v)]));
}

/**
 * The scheme of a package version in the update. Includes the package.json keys, as well as some additional npm metadata
 * @see https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#version
 */
export interface VersionInfo {
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
  readonly seq?: string | number;
}

/**
 * We are accounting for a good bit of legacy data modeling here
 *
 * The file can be a just a number, or a combination of a sequence number (which
 * is potentially encoded as a string) and a set of known versions and the dates
 * we first saw them. The date can be encoded as an ISO string, or a timestamp
 * number.
 */
type MarkerFileSchema =
  | number
  | {
      marker: number | string;
      knownVersions?: Record<string, string | number>;
    };

interface KnownVersionsFileSchema {
  knownVersions: Record<string, string>;
}

interface Document {
  /**
   * a List of all Version objects for the package
   */
  readonly versions: { [key: string]: VersionInfo | undefined };

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

  readonly [key: string]: unknown;
}

interface Change extends DatabaseChange {
  readonly doc: Document;
}
