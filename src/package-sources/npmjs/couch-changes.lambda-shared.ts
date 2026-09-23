import { EventEmitter } from 'events';
import { IncomingMessage, OutgoingHttpHeaders } from 'http';
import { Agent, request, RequestOptions } from 'https';
import { json } from 'node:stream/consumers';
import { Readable } from 'stream';
import { URL } from 'url';
import { createGunzip } from 'zlib';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/';

/**
 * How long to keep retrying transient request failures. Can be overridden
 * through the environment for testing purposes.
 */
function requestDeadlineMs(): number {
  const fromEnv = process.env.REQUEST_DEADLINE_MS;
  return fromEnv ? Number(fromEnv) : 30_000;
}

const REQUEST_ATTEMPT_TIMEOUT_MS = 5_000;

const DEFAULT_BATCH_SIZE = 100;

const MAX_CONNS_PER_HOST = 100;

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
   * Obtains a batch of change entries from the database, without fetching the
   * associated package metadata. Entries are deduplicated against previously
   * received ones (via the follower state receipts) before any metadata is
   * fetched, which is why this method does not fetch it eagerly.
   *
   * @param since     the sequence value since when history should be fetched.
   * @param batchSize the maximum amount of entries to return in a single page.
   *
   * @returns a page of change entries.
   */
  public async changes(
    since: string | number,
    opts?: { readonly batchSize?: number }
  ): Promise<DatabaseChanges> {
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
   * Fetches the registry metadata for each of the provided change entries and
   * attaches it to the entry. Entries for deleted or unreachable packages are
   * dropped.
   *
   * The registry is a separate system from the changes feed and can serve a
   * packument revision older than the revision the feed announced (a "laggy
   * packument"). Such entries are returned with `laggy: true`: the caller
   * should process the versions that were served, and separately track the
   * expectation that the announced revision will eventually appear.
   */
  public async attachAllMetadata(
    changes: readonly DatabaseChange[]
  ): Promise<AttachedMetadata> {
    const ok = new Array<AttachedChange>();
    const failedSeqs = new Array<number>();
    await Promise.all(
      changes.map(async (change) => {
        try {
          const outcome = await this.attachMetadata(change);
          if (outcome !== undefined) {
            ok.push(outcome);
          }
        } catch (error) {
          // One unreachable packument must not fail the whole batch. The
          // entry is reported as failed so the caller does not record a
          // receipt for it; a later scan retries it.
          console.error(
            `Failed to fetch metadata for ${change.id}, a later scan will retry it: ${error}`
          );
          const seq = Number(change.seq);
          if (!isNaN(seq)) {
            failedSeqs.push(seq);
          }
        }
      })
    );
    return { ok, failedSeqs };
  }

  private async attachMetadata(
    change: DatabaseChange
  ): Promise<AttachedChange | undefined> {
    // Filter out deleted packages or null ids
    if (change.deleted || !change.id) {
      console.log(`Skipping ${change.id}: deleted or null id`);
      return undefined;
    }

    // note: this function should not throw validation errors as
    // it may cause a poison pill - whereby a single corrupt package will
    // fail the entire lambda execution and prevent us from ingesting any package.
    // instead, log the violation and return undefined.
    const metadataUrl = new URL(change.id, NPM_REGISTRY_URL);
    console.log(`Fetching metadata for ${change.id}: ${metadataUrl}`);
    let meta;
    try {
      meta = await this.https('get', metadataUrl);
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) {
        console.log(
          `Skipping ${change.id} because of HTTP 404 (Not Found) error`
        );
        return undefined;
      }
      throw e;
    }

    if (!meta) {
      // can happen if a package was removed from npm
      console.log(`Skipping ${change.id} because no metadata found`);
      return undefined;
    }
    if (!meta._rev) {
      // can happen if a package was removed from npm
      console.log(`Skipping ${change.id} because no _rev found in metadata`);
      return undefined;
    }

    const announcedRev = getMaxSequentialRevision(change);
    const servedRev = parseSequentialRevision(meta._rev as string);
    change.doc = meta; // add metadata to the change object

    return {
      change,
      announcedRev,
      servedRev,
      laggy: servedRev < announcedRev,
    };
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

    const deadline = Date.now() + requestDeadlineMs();
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
  return (
    e instanceof RetryableError ||
    (e as any).code === 'ECONNRESET' ||
    // A truncated response body (the gunzip stream ends unexpectedly). Seen
    // repeatedly from registry.npmjs.org; transient like a connection reset.
    (e as any).code === 'Z_BUF_ERROR'
  );
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
 * The highest sequential revision announced by a change entry.
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
   * The last sequence ID from this change set. For ascending requests, this
   * is the value that should be passed to a subsequent `.changes` call to
   * fetch the next page.
   */
  readonly last_seq: string | number;

  /**
   * The change entries that are part of this batch (no metadata attached).
   */
  readonly results: readonly DatabaseChange[];

  /**
   * The sequence numbers of all the change entries received in this batch.
   */
  readonly seqs: readonly number[];

  /**
   * The total count of change entries in this batch. For ascending requests,
   * 0 indicates we are up to date with "now".
   */
  readonly totalCount: number;
}

/**
 * The result of attaching registry metadata to a batch of change entries.
 */
export interface AttachedMetadata {
  /**
   * The change entries whose metadata could be fetched.
   */
  readonly ok: AttachedChange[];

  /**
   * The sequence numbers of change entries whose metadata fetch failed. No
   * receipt must be recorded for these, so that a later scan retries them.
   */
  readonly failedSeqs: number[];
}

/**
 * A change entry with its registry metadata attached.
 */
export interface AttachedChange {
  /**
   * The change entry, with the packument attached as `doc`.
   */
  readonly change: DatabaseChange;

  /**
   * The highest sequential revision announced by the changes feed for this
   * entry.
   */
  readonly announcedRev: number;

  /**
   * The sequential revision of the packument the registry actually served.
   */
  readonly servedRev: number;

  /**
   * Whether the served packument is behind the announced revision (a "laggy
   * packument"). The served versions can (and should) still be processed, but
   * the announced revision has not been observed yet.
   */
  readonly laggy: boolean;
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
