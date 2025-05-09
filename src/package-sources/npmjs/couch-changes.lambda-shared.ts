import { EventEmitter } from 'events';
import { OutgoingHttpHeaders } from 'http';
import { Agent, request, RequestOptions } from 'https';
import { Readable } from 'stream';
import { URL } from 'url';
import { createGunzip } from 'zlib';
import * as JSONStream from 'JSONStream';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/';

const REQUEST_DEADLINE_MS = 30_000;

const REQUEST_ATTEMPT_TIMEOUT_MS = 5_000;

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
      maxSockets: 4,

      // This timeout is separate from the request timeout, and is here to
      // prevent stalled/idle connections
      timeout: 60_000,
    });
    this.baseUrl = new URL(baseUrl);
    this.database = database;
  }

  /**
   * @returns summary informations about the database.
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
    const batchSize = opts?.batchSize ?? 100;

    const changesUrl = new URL(this.database, this.baseUrl);
    changesUrl.searchParams.set('limit', batchSize.toFixed());
    changesUrl.searchParams.set('since', since.toString());

    const result = (await this.https('get', changesUrl)) as any;

    const last_seq = result.last_seq;
    const results = await this.fetchAndFilterAllMetadata(result.results);

    return {
      last_seq,
      results,
    };
  }

  private async fetchAndFilterMetadata(change: DatabaseChange) {
    // Filter out deleted packages or null ids
    if (change.deleted || !change.id) {
      console.log(`Skipping ${change.id}: deleted or null id`);
      return;
    }

    const metadataUrl = new URL(change.id, NPM_REGISTRY_URL);
    console.log(`Fetching metadata for ${change.id}: ${metadataUrl}`);

    try {
      const meta = await this.https('get', metadataUrl);
      change.doc = meta; // add metadata to the change object
      return change;
    } catch (e: any) {
      if (e.message?.includes('HTTP 404')) {
        console.log(
          `Skipping ${change.id} because of HTTP 404 (Not Found) error`
        );
        return;
      }
      throw e;
    }
  }

  private async fetchAndFilterAllMetadata(
    changes: DatabaseChange[]
  ): Promise<DatabaseChange[]> {
    return (
      await Promise.all(
        changes.map((change) => this.fetchAndFilterMetadata(change))
      )
    ).filter((change): change is DatabaseChange => change !== undefined);
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
        return await new Promise((ok, ko) => {
          const req = request(url, requestOptions, (res) => {
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

            res.once('error', ko);

            const json = JSONStream.parse(true);
            json.once('data', ok);
            json.once('error', ko);

            const plainPayload =
              res.headers['content-encoding'] === 'gzip' ? gunzip(res) : res;
            plainPayload.pipe(json, { end: true });
            plainPayload.once('error', ko);
          });

          req.on('error', ko);
          req.on('timeout', () => {
            req.destroy(
              new RetryableError(
                `Timeout after ${REQUEST_ATTEMPT_TIMEOUT_MS}ms, aborting request`
              )
            );
          });

          req.end(body && JSON.stringify(body, null, 2));
        });
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

class RetryableError extends Error {}

function isRetryableError(e: Error): boolean {
  return e instanceof RetryableError || (e as any).code === 'ECONNRESET';
}

async function sleep(ms: number) {
  return new Promise((ok) => setTimeout(ok, ms));
}

export interface DatabaseChanges {
  /**
   * The last sequence ID from this change set. This is the value that should be
   * passed to the subsequent `.changes` call to fetch the next page.
   */
  readonly last_seq: string | number;

  /**
   * The amount of pending changes from the server. This value is not always
   * returned by the servers.
   */
  readonly pending?: number;

  /**
   * The changes that are part of this batch.
   */
  readonly results: readonly DatabaseChange[];
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
