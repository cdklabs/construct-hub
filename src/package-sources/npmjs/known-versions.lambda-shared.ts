import { DynamoDB, WriteRequest } from '@aws-sdk/client-dynamodb';
import { Sema } from 'async-sema';
import * as AWSXRay from 'aws-xray-sdk-core';
import { KnownVersionsAttribute } from './constants.lambda-shared';

/** The maximum number of concurrent requests to the table. */
const MAX_CONCURRENT_REQUESTS = 32;

/** The maximum number of items in a single `BatchWriteItem` request. */
const BATCH_WRITE_SIZE = 25;

/** How often unprocessed items of a batch write are retried. */
const MAX_BATCH_WRITE_ATTEMPTS = 10;

/**
 * The DynamoDB client. Throttling errors are retried by the SDK; the default
 * of 3 attempts is raised, since a burst of writes (for example during a
 * backfill) can be throttled for longer than that.
 */
const DYNAMODB = AWSXRay.captureAWSv3Client(new DynamoDB({ maxAttempts: 10 }));

/**
 * The package versions the follower has processed, backed by a DynamoDB
 * table keyed by package name and version.
 *
 * `has` loads all recorded versions of a package on first use and caches them.
 * `add` records a version locally right away; `flush` persists the records,
 * in batches.
 */
export class KnownVersions {
  private readonly loads = new Map<string, Promise<ReadonlySet<string>>>();
  private readonly added = new Set<string>();
  private readonly pending = new Set<string>();
  private readonly semaphore = new Sema(MAX_CONCURRENT_REQUESTS);

  public constructor(
    private readonly tableName: string,
    private readonly client: DynamoDB = DYNAMODB
  ) {}

  /**
   * Whether a package version has been processed.
   */
  public async has(name: string, version: string): Promise<boolean> {
    if (this.added.has(keyOf(name, version))) {
      return true;
    }
    return (await this.versionsOf(name)).has(version);
  }

  /**
   * Records a processed package version. The record is persisted by the next
   * `flush`.
   */
  public add(name: string, version: string): void {
    const key = keyOf(name, version);
    this.added.add(key);
    this.pending.add(key);
  }

  /** The number of records waiting to be persisted. */
  public get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Persists all records made by `add` since the last flush.
   */
  public async flush(): Promise<void> {
    const keys = Array.from(this.pending);
    this.pending.clear();
    try {
      const requests = keys.map((key) => {
        const [name, version] = splitKey(key);
        const request: WriteRequest = {
          PutRequest: { Item: toItem(name, version) },
        };
        return request;
      });
      const batches = new Array<WriteRequest[]>();
      for (let i = 0; i < requests.length; i += BATCH_WRITE_SIZE) {
        batches.push(requests.slice(i, i + BATCH_WRITE_SIZE));
      }
      await Promise.all(
        batches.map((batch) => this.limited(() => this.batchWrite(batch)))
      );
    } catch (error) {
      // Keep the records for the next attempt (writes are idempotent).
      for (const key of keys) {
        this.pending.add(key);
      }
      throw error;
    }
  }

  /**
   * The recorded versions of a package. Each package is queried at most once;
   * concurrent callers share the same query.
   */
  private versionsOf(name: string): Promise<ReadonlySet<string>> {
    let load = this.loads.get(name);
    if (load == null) {
      load = this.query(name);
      this.loads.set(name, load);
      // A failed query must not be cached.
      load.catch(() => this.loads.delete(name));
    }
    return load;
  }

  private async query(name: string): Promise<ReadonlySet<string>> {
    const versions = new Set<string>();
    let exclusiveStartKey: Parameters<
      DynamoDB['query']
    >[0]['ExclusiveStartKey'];
    do {
      const response = await this.limited(() =>
        this.client.query({
          TableName: this.tableName,
          ConsistentRead: true,
          KeyConditionExpression: '#name = :name',
          ProjectionExpression: '#version',
          ExpressionAttributeNames: {
            '#name': KnownVersionsAttribute.NAME,
            '#version': KnownVersionsAttribute.VERSION,
          },
          ExpressionAttributeValues: { ':name': { S: name } },
          ExclusiveStartKey: exclusiveStartKey,
        })
      );
      for (const item of response.Items ?? []) {
        const version = item[KnownVersionsAttribute.VERSION]?.S;
        if (version != null) {
          versions.add(version);
        }
      }
      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey != null);
    return versions;
  }

  /**
   * Writes a batch, retrying unprocessed items. The SDK retries throttling
   * errors, but not unprocessed items (which DynamoDB returns when part of a
   * batch was throttled).
   */
  private async batchWrite(batch: WriteRequest[]): Promise<void> {
    let unprocessed: WriteRequest[] = batch;
    for (
      let attempt = 1;
      unprocessed.length > 0 && attempt <= MAX_BATCH_WRITE_ATTEMPTS;
      attempt++
    ) {
      if (attempt > 1) {
        await sleep(Math.min(2 ** attempt * 50, 5_000));
      }
      const response = await this.client.batchWriteItem({
        RequestItems: { [this.tableName]: unprocessed },
      });
      unprocessed = response.UnprocessedItems?.[this.tableName] ?? [];
    }
    if (unprocessed.length > 0) {
      throw new Error(
        `Could not write ${unprocessed.length} known version(s) to ${this.tableName} after ${MAX_BATCH_WRITE_ATTEMPTS} attempts`
      );
    }
  }

  private async limited<T>(fn: () => Promise<T>): Promise<T> {
    await this.semaphore.acquire();
    try {
      return await fn();
    } finally {
      this.semaphore.release();
    }
  }
}

function toItem(name: string, version: string) {
  return {
    [KnownVersionsAttribute.NAME]: { S: name },
    [KnownVersionsAttribute.VERSION]: { S: version },
  };
}

function keyOf(name: string, version: string): string {
  return `${name}@${version}`;
}

/**
 * Splits a `name@version` key made by `keyOf`. Scoped package names start
 * with `@`, so the separator is the last `@`.
 */
function splitKey(key: string): [name: string, version: string] {
  const at = key.lastIndexOf('@');
  return [key.slice(0, at), key.slice(at + 1)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
