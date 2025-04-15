import { EventEmitter } from 'events';
import { OutgoingHttpHeaders } from 'http';
import { Agent, request } from 'https';
import { Readable } from 'stream';
import { URL } from 'url';
import { createGunzip } from 'zlib';
import * as JSONStream from 'JSONStream';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/';

/**
 * A utility class that helps with traversing CouchDB database changes streams
 * in a promise-based, page-by-page manner.
 */
export class CouchChanges extends EventEmitter {
  private readonly agent: Agent;
  private readonly baseUrl: URL;
  private readonly databaseUrl: URL;

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
      timeout: 60_000,
    });
    this.baseUrl = new URL(baseUrl);
    this.databaseUrl = new URL(database, baseUrl);
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

    const changesUrl = new URL('_changes', this.databaseUrl);
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
    const meta = await this.https('get', metadataUrl);
    change.doc = meta; // add metadata to the change object
    return change;
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
  private https(
    method: string,
    url: URL,
    body?: { [key: string]: unknown },
    attempt = 1
  ): Promise<{ [key: string]: unknown }> {
    return new Promise((ok, ko) => {
      const retry = () =>
        setTimeout(() => {
          console.log(`Retrying ${method.toUpperCase()} ${url}`);
          this.https(method, url, body, attempt + 1).then(ok, ko);
        }, Math.min(500 * attempt, 5_000));

      const headers: OutgoingHttpHeaders = {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'npm-replication-opt-in': 'true', // can be deleted after May 29: https://github.com/orgs/community/discussions/152515
      };
      if (body) {
        headers['Content-Type'] = 'application/json';
      }
      console.log(
        `Request: ${method.toUpperCase()} ${url}, ${JSON.stringify(headers)}`
      );
      const req = request(
        url,
        {
          agent: this.agent,
          headers,
          method,
          port: 443,
          servername: url.hostname,
        },
        (res) => {
          if (res.statusCode == null) {
            const error = new Error(
              `[FATAL] Request failed: ${method.toUpperCase()} ${url}`
            );
            Error.captureStackTrace(error);
            return ko(error);
          }

          console.log(
            `Response: ${method.toUpperCase()} ${url} => HTTP ${
              res.statusCode
            } (${res.statusMessage})`
          );

          // Transient (server) errors:
          if (res.statusCode >= 500 && res.statusCode < 600) {
            console.error(
              `[RETRYABLE] HTTP ${res.statusCode} (${
                res.statusMessage
              }) - ${method.toUpperCase()} ${url}`
            );
            // Call again after a short back-off
            return retry();
          }
          // Permanent (client) errors:
          if (res.statusCode >= 400 && res.statusCode < 500) {
            const error = new Error(
              `[FATAL] HTTP ${res.statusCode} (${
                res.statusMessage
              }) - ${method.toUpperCase()} ${url}`
            );
            Error.captureStackTrace(error);
            return ko(error);
          }

          const onError = (err: Error & { code?: string }) => {
            if (err.code === 'ECONNRESET') {
              // Transient networking problem?
              console.error(
                `[RETRYABLE] ${err.code} - ${method.toUpperCase()} ${url}`
              );
              retry();
            } else {
              Error.captureStackTrace(err);
              console.log('[NON-RETRYABLE]', err);
              ko(err);
            }
          };

          res.once('error', onError);

          const json = JSONStream.parse(true);
          json.once('data', ok);
          json.once('error', onError);

          const plainPayload =
            res.headers['content-encoding'] === 'gzip' ? gunzip(res) : res;
          plainPayload.pipe(json, { end: true });
          plainPayload.once('error', onError);
        }
      );
      req.end(body && JSON.stringify(body, null, 2));
    });
  }
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
