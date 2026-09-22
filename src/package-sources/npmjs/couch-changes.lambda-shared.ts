import { EventEmitter } from 'events';
import { IncomingMessage, OutgoingHttpHeaders } from 'http';
import { Agent, request, RequestOptions } from 'https';
import { json } from 'node:stream/consumers';
import { Readable } from 'stream';
import { URL } from 'url';
import { createGunzip } from 'zlib';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/';

const REQUEST_DEADLINE_MS = 30_000;

const REQUEST_ATTEMPT_TIMEOUT_MS = 5_000;

const DEFAULT_BATCH_SIZE = 100;

const MAX_CONNS_PER_HOST = 100;

/**
 * How long to wait for the npm registry metadata to catch up with the
 * revision announced by the `_changes` feed, before giving up on the change
 * (it is then deferred to the stale-metadata retry queue by the caller).
 * Can be overridden through the environment for testing purposes.
 */
function maxPackageServerLagMs(): number {
  const fromEnv = process.env.MAX_PACKAGE_SERVER_LAG_MS;
  return fromEnv ? Number(fromEnv) : 30_000; // 30 seconds
}

/**
 * A utility class that helps with traversing CouchDB database changes streams
 * in a promise-based, page-by-page manner.
 */
export class CouchChanges extends EventEmitter {
  private readonly agent: Agent;
  private readonly baseUrl: URL;
  private readonly database: string;

  /**
   * @param baseUrl  the CouchDB endpoint URL.
   * @param database the name of the database for which changes are fetched.
   */
  public constructor(baseUrl: string, database: string) {
    super();
    // Setting up for keep-alive connections.
    this.agent = new Agent({
      keepAlive: true,
      keepAliveMsecs: 5_000,
      maxSockets: MAX_CONNS_PER_HOST,

      // This timeout is separate from the request timeout, and is here to
      // prevent stalled/idle connections
      timeout: 60_000,
    });
    this.baseUrl = new URL(baseUrl);
    this.database = database;
  }

  /**
   * @returns summary information about the database.
   */
  public async info(): Promise<DatabaseInfos> {
    return (await this.https('get', this.baseUrl)) as any;
  }

  /**
   * Obtains a batch of changes from the database.
   *
   * @param since     the sequence value since when history should be fetched.
   * @param batchSize the maximum amount of changes to return in a single page.
   *
   * @returns a page of changes.
   */
  public async changes(
    since: string | number,
    opts?: { readonly batchSize?: number }
  ): Promise<DatabaseChanges> {
    const raw = await this.rawChanges(since, opts);
    const { ok, stale } = await this.fetchAndFilterAllMetadata(raw.results);

    return {
      last_seq: raw.last_seq,
      actionableResults: ok,
      staleResults: stale,
      seqs: raw.seqs,
      totalCount: raw.totalCount,
    };
  }

  /**
   * Obtains a batch of changes from the database, without fetching the
   * associated package metadata. This is used by the overlap sweep, which
   * discards already-processed rows before paying for any metadata fetch.
   *
   * @param since     the sequence value since when history should be fetched.
   * @param batchSize the maximum amount of changes to return in a single page.
   *
   * @returns a page of raw changes.
   */
  public async rawChanges(
    since: string | number,
    opts?: { readonly batchSize?: number }
  ): Promise<RawDatabaseChanges> {
    const batchSize = opts?.batchSize ?? DEFAULT_BATCH_SIZE;

    const changesUrl = new URL(this.database, this.baseUrl);
    changesUrl.searchParams.set('limit', batchSize.toFixed());
    changesUrl.searchParams.set('since', since.toString());

    const result = (await this.https('get', changesUrl)) as any;

    const results: DatabaseChange[] = result.results ?? [];
    return {
      last_seq: result.last_seq,
      results,
      seqs: results
        .map((change) => Number(change.seq))
        .filter((seq) => !isNaN(seq)),
      totalCount: results.length,
    };
  }

  /**
   * Fetches the current metadata document for the provided package name from
   * the npm registry.
   *
   * @returns the metadata document, or `undefined` if the package does not
   *          exist (HTTP 404).
   */
  public async getPackageDoc(
    packageName: string
  ): Promise<{ readonly [key: string]: unknown } | undefined> {
    const metadataUrl = new URL(packageName, NPM_REGISTRY_URL);
    try {
      return await this.https('get', metadataUrl);
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) {
        return undefined;
      }
      throw e;
    }
  }

  /**
   * Fetch the metadata associated with a change. The change comes associated with a revision number,
   * which can be compared to the revision number of the metadata to determine if the replica is
   * lagging behind the changes stream. If so, we retry until the replica is up-to-date or until
   * 30 seconds elapsed, after which the change is reported as stale so the caller can defer it
   * for a later retry (the registry occasionally takes much longer to serve the new revision, and
   * processing the stale document would silently miss the new versions).
   */
  private async fetchAndFilterMetadata(
    change: DatabaseChange
  ): Promise<{ change: DatabaseChange; stale: boolean } | undefined> {
    // Filter out deleted packages or null ids
    if (change.deleted || !change.id) {
      console.log(`Skipping ${change.id}: deleted or null id`);
      return;
    }

    const latestChangesRev = getMaxSequentialRevision(change);
    const metadataUrl = new URL(change.id, NPM_REGISTRY_URL);
    console.log(`Fetching metadata for ${change.id}: ${metadataUrl}`);

    // Retry configuration
    const baseDelay = 1_000; // 1 second
    const maxDelay = 8_000; // 8 seconds max
    let attempt = 0;
    const startTime = Date.now();

    // note: this function should not throw validation errors as
    // it may cause a poison pill - whereby a single corrupt package will
    // fail the entire lambda execution and prevent us from ingesting any package.
    // instead, log the violation and return undefined.

    do {
      try {
        const meta = await this.https('get', metadataUrl);
        if (!meta) {
          // can happen if a package was removed from npm
          console.log(`Skipping ${change.id} because no metadata found`);
          return;
        }
        if (!meta._rev) {
          // can happen if a package was removed from npm
          console.log(
            `Skipping ${change.id} because no _rev found in metadata`
          );
          return;
        }
        const latestReplicaRev = parseSequentialRevision(meta._rev as string);

        // Happy path: replica is up-to-date
        if (latestReplicaRev >= latestChangesRev) {
          change.doc = meta; // add metadata to the change object
          return { change, stale: false };
        }

        // Unhappy path: replica is behind. Calculate delay and retry
        const delay = Math.floor(
          Math.random() * Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
        );
        console.log(
          `${change.id}: package _rev ${latestReplicaRev} < expected replication rev ${latestChangesRev}, retrying in ${delay} ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
      } catch (e: any) {
        if (e.message?.includes('HTTP 404')) {
          console.log(
            `Skipping ${change.id} because of HTTP 404 (Not Found) error`
          );
          return;
        }
        throw e;
      }
    } while (Date.now() - startTime < maxPackageServerLagMs());

    // Timeout reached. Do NOT process the stale document (it may be missing
    // the very versions this change is about) - report it for deferral.
    console.log(
      `Timeout reached for ${change.id}, metadata is stale (registry lags behind the changes feed), deferring`
    );
    return { change, stale: true };
  }

  /**
   * Fetches the metadata for all the provided changes, and splits them into
   * changes for which up-to-date metadata could be obtained (`ok`) and
   * changes for which the registry metadata was still stale after the
   * maximum wait (`stale`).
   */
  public async fetchAndFilterAllMetadata(
    changes: readonly DatabaseChange[]
  ): Promise<{ ok: DatabaseChange[]; stale: DatabaseChange[] }> {
    const outcomes = await Promise.all(
      changes.map((change) => this.fetchAndFilterMetadata(change))
    );
    const ok = new Array<DatabaseChange>();
    const stale = new Array<DatabaseChange>();
    for (const outcome of outcomes) {
      if (outcome == null) {
        continue;
      }
      (outcome.stale ? stale : ok).push(outcome.change);
    }
    return { ok, stale };
  }

  /**
   * Makes an HTTPs request using the provided method, url, and optionally payload. This function
   * properly handles input that is received with `Content-Type: gzip` and automatically retries
   * typical transient errors (HTTP 5XX, ECONNRESET, etc...) with linear back-off and no maximum
   * retry count (this is used in Lambda functions, which de-facto caps the amount of attempts
   * that will be made due to the function time out).
   *
   * @param method the HTTP method used for the request (e.g: 'get', 'post', ...).
   * @param url    the URL to request.
   * @param body   an optional HTTP request payload, which will be JSON-encoded.
   *
   * @param attempt the request attempt number (used to determine back-off / retry).
   *
   * @returns the JSON-decoded response body.
   */
  private async https(
    method: 'get' | 'post',
    url: URL,
    body?: { [key: string]: unknown }
  ): Promise<{ [key: string]: unknown }> {
    const headers: OutgoingHttpHeaders = {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'npm-replication-opt-in': 'true', // can be deleted after May 29: https://github.com/orgs/community/discussions/152515
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const requestOptions: RequestOptions = {
      agent: this.agent,
      headers,
      method,
      port: 443,
      servername: url.hostname,
      // This just leads to a 'timeout' event
      timeout: REQUEST_ATTEMPT_TIMEOUT_MS,
    };

    const deadline = Date.now() + REQUEST_DEADLINE_MS;
    let maxDelay = 100;
    while (true) {
      try {
        const res = await requestPromise(url, requestOptions, body);
        if (res.statusCode == null) {
          throw new RetryableError('No status code available');
        }

        // Server errors. We can't know whether these are really retryable but we usually pretend that they are.
        if (res.statusCode >= 500 && res.statusCode < 600) {
          throw new RetryableError(
            `HTTP ${res.statusCode} ${res.statusMessage}`
          );
        }

        // Permanent (client) errors:
        if (res.statusCode >= 400 && res.statusCode < 500) {
          throw new Error(`HTTP ${res.statusCode} ${res.statusMessage}`);
        }

        console.log(
          `Response: ${method.toUpperCase()} ${url} => HTTP ${
            res.statusCode
          } (${res.statusMessage})`
        );

        return await readResponseJson(res);
      } catch (e: any) {
        if (Date.now() > deadline || !isRetryableError(e)) {
          throw e;
        }

        console.error(`[RETRYABLE] ${method} ${url}: ${e}`);

        await sleep(Math.floor(Math.random() * maxDelay));
        maxDelay *= 2;
      }
    }
  }
}

/**
 * A Promisified version of `https.request()` that also handles timeout events
 */
function requestPromise(
  url: URL,
  options: RequestOptions,
  body?: Record<string, unknown>
) {
  return new Promise<IncomingMessage>((ok, ko) => {
    const req = request(url, options ?? {}, ok);
    req.on('error', ko);
    req.on('timeout', () => {
      req.destroy(
        new RetryableError(
          `Timeout after ${options.timeout}ms, aborting request`
        )
      );
    });
    req.end(body && JSON.stringify(body, null, 2));
  });
}

function readResponseJson(
  res: IncomingMessage
): Promise<Record<string, unknown>> {
  return new Promise((ok, ko) => {
    res.once('error', ko);

    const plainPayload =
      res.headers['content-encoding'] === 'gzip' ? gunzip(res) : res;

    return json(plainPayload)
      .then((parsed) => ok(parsed as any))
      .catch((err) => ko(err));
  });
}

class RetryableError extends Error {}

function isRetryableError(e: Error): boolean {
  return e instanceof RetryableError || (e as any).code === 'ECONNRESET';
}

async function sleep(ms: number) {
  return new Promise((ok) => setTimeout(ok, ms));
}

/**
 * Parses the sequential (numeric) prefix of a CouchDB revision string (e.g.
 * `42` for `42-0bf6e0fa87ae20bc7245f96216263817`).
 */
export function parseSequentialRevision(rev: string): number {
  return parseInt(rev.split('-')[0]);
}

/**
 * The highest sequential revision announced by a change.
 */
export function getMaxSequentialRevision(change: DatabaseChange): number {
  return Math.max(
    ...change.changes
      .map((c) => parseSequentialRevision(c.rev))
      .filter((num) => !isNaN(num))
  );
}

export interface DatabaseChanges {
  /**
   * The last sequence ID from this change set. This is the value that should be
   * passed to the subsequent `.changes` call to fetch the next page.
   */
  readonly last_seq: string | number;

  /**
   * The actionable changes that are part of this batch.
   * This has deleted and unreachable packages removed.
   */
  readonly actionableResults: readonly DatabaseChange[];

  /**
   * Changes for which the registry metadata was still stale (behind the
   * revision announced by the changes feed) after the maximum wait. These
   * should be deferred for a later retry.
   */
  readonly staleResults: readonly DatabaseChange[];

  /**
   * The sequence numbers of ALL the changes received in this batch (including
   * deleted and unreachable packages), for receipt tracking.
   */
  readonly seqs: readonly number[];

  /**
   * The total count of changes in this batch. This includes unprocessable changes.
   * 0 indicates we are up to date with "now".
   */
  readonly totalCount: number;
}

export interface RawDatabaseChanges {
  /**
   * The last sequence ID from this change set.
   */
  readonly last_seq: string | number;

  /**
   * The raw changes that are part of this batch (no metadata attached).
   */
  readonly results: readonly DatabaseChange[];

  /**
   * The sequence numbers of all the changes received in this batch.
   */
  readonly seqs: readonly number[];

  /**
   * The total count of changes in this batch. 0 indicates we are up to date
   * with "now".
   */
  readonly totalCount: number;
}

export interface DatabaseChange {
  /**
   * The set of revisions to the object that were resolved as part of this
   * change.
   */
  readonly changes: ReadonlyArray<{ readonly rev: string }>;

  /**
   * The ID of the document that has changed.
   */
  readonly id: string;

  /**
   * The sequence ID for this change in the stream. It may not be present for
   * all (or any) entries in the result.
   */
  readonly seq?: string | number;

  /**
   * Whether this change corresponds to this document being deleted.
   */
  readonly deleted: boolean;

  /**
   * If present, the resolved document after the change has been applied.
   */
  doc?: { readonly [key: string]: unknown };
}

export interface DatabaseInfos {
  readonly db_name: string;
  readonly disk_format_version: number;
  readonly doc_count: number;
  readonly doc_del_count: number;
  readonly instance_start_time: string;
  readonly purge_seq: string | number;
  readonly sizes: {
    readonly active: number;
    readonly external: number;
    readonly file: number;
  };
  readonly update_seq: string | number;
}

function gunzip(readable: Readable): Readable {
  const gz = createGunzip();
  readable.pipe(gz, { end: true });
  return gz;
}
