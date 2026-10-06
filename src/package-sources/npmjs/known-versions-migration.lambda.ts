import {
  ENV_KNOWN_VERSIONS_TABLE_NAME,
  KNOWN_VERSIONS_FILE_NAME,
  MARKER_FILE_NAME,
} from './constants.lambda-shared';
import { KnownVersions } from './known-versions.lambda-shared';
import {
  loadContentFromS3,
  MarkerFileSchema,
} from './staging-bucket.lambda-shared';
import { requireEnv } from '../../backend/shared/env.lambda-shared';

/**
 * Copies the known versions of an existing deployment from the known versions
 * file in S3 to the known versions table. Invoked twice during the deployment
 * that creates the table: before the follower function is updated (so the new
 * follower code only runs once the table is filled; if this fails, the
 * deployment fails), and again after it (to pick up the versions the old
 * follower code recorded in the file in the meantime).
 *
 * Writes are idempotent, so running it again only adds what is missing. Records
 * that can never be written are skipped and logged. A new deployment has no
 * file, and this does nothing: the table fills up during the backfill.
 *
 * The file is left in place, and is no longer updated: if a deployment is
 * rolled back to a version that still reads it, only the versions processed
 * since the migration are processed again.
 */
export async function handler(): Promise<{
  readonly written: number;
  readonly skipped: readonly string[];
}> {
  const stagingBucket = requireEnv('BUCKET_NAME');
  const knownVersions = new KnownVersions(
    requireEnv(ENV_KNOWN_VERSIONS_TABLE_NAME)
  );

  const keys = await loadKnownVersionsFile(stagingBucket);
  console.log(
    `Migrating ${keys.length} known version(s) to the known versions table`
  );

  // Records that can never be written are skipped, so they cannot block the
  // others.
  const skipped = new Array<string>();
  for (const key of keys) {
    const parsed = parseKey(key);
    if (parsed == null) {
      console.warn(`Skipping invalid known version record: ${key}`);
      skipped.push(key);
      continue;
    }
    knownVersions.add(...parsed);
  }
  const written = knownVersions.pendingCount;
  await knownVersions.flush();

  console.log(
    `Known versions migration complete: ${written} migrated, ${skipped.length} skipped`
  );
  return { written, skipped };
}

/**
 * The maximum sizes of the table's key attributes, in bytes.
 * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ServiceQuotas.html#limits-partition-sort-keys
 */
const MAX_PARTITION_KEY_BYTES = 2_048;
const MAX_SORT_KEY_BYTES = 1_024;

/**
 * Splits a `name@version` key. Scoped package names start with `@`, so the
 * separator is the last `@`.
 *
 * @returns `undefined` for a key the table cannot store: no name, no version,
 *          or a part longer than DynamoDB allows for a key attribute.
 */
function parseKey(key: string): [name: string, version: string] | undefined {
  const at = key.lastIndexOf('@');
  if (at <= 0 || at === key.length - 1) {
    return undefined;
  }
  const name = key.slice(0, at);
  const version = key.slice(at + 1);
  if (
    Buffer.byteLength(name) > MAX_PARTITION_KEY_BYTES ||
    Buffer.byteLength(version) > MAX_SORT_KEY_BYTES
  ) {
    return undefined;
  }
  return [name, version];
}

/**
 * Loads the known versions from the known versions file in S3. For legacy
 * reasons, they may also be embedded in the transaction marker file; when the
 * dedicated file does not exist, that location is used.
 *
 * @returns the `name@version` keys; empty if neither file holds known
 *          versions (a new deployment).
 */
async function loadKnownVersionsFile(stagingBucket: string): Promise<string[]> {
  const content = await loadContentFromS3(
    stagingBucket,
    KNOWN_VERSIONS_FILE_NAME,
    `Known versions object (s3://${stagingBucket}/${KNOWN_VERSIONS_FILE_NAME}) does not exist`
  );
  if (content != null) {
    const contentsObj: KnownVersionsFileSchema = JSON.parse(content);
    console.log('Loaded known versions file');
    return Object.keys(contentsObj.knownVersions);
  }

  // Legacy location: embedded in the transaction marker file.
  const markerContent = await loadContentFromS3(
    stagingBucket,
    MARKER_FILE_NAME,
    `No legacy marker object (s3://${stagingBucket}/${MARKER_FILE_NAME})`
  );
  if (markerContent != null) {
    try {
      const parsed: MarkerFileSchema = JSON.parse(markerContent);
      if (typeof parsed !== 'number' && parsed.knownVersions) {
        console.log('Loaded known versions from legacy marker file');
        return Object.keys(parsed.knownVersions);
      }
    } catch (error) {
      console.warn(`Could not parse legacy marker: ${error}`);
    }
  }
  return [];
}

/**
 * The known versions file format: `name@version` keys mapped to the
 * `modified` timestamps of the versions (no longer used).
 */
interface KnownVersionsFileSchema {
  knownVersions: Record<string, string>;
}
