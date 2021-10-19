import { EventEmitter } from 'events';
import { OutgoingHttpHeaders } from 'http';
import { Agent, request } from 'https';
import { URL } from 'url';
import { gunzipSync } from 'zlib';

/**
 * A utility class that helps with traversing CouchDB database changes streams
 * in a promise-based, page-by-page manner.
 */
export class CouchChanges extends EventEmitter {
  private readonly agent: Agent;
  private readonly baseUrl: URL;

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
    this.baseUrl = new URL(database, baseUrl);
  }

  /**
   * @returns summary informations about the database.
   */
  public async info(): Promise<DatabaseInfos> {
    return await this.https('get', this.baseUrl) as any;
  }

  /**
   * Obtains a batch of changes from the database.
   *
   * @param since     the sequence value since when history should be fetched.
   * @param batchSize the maximum amount of changes to return in a single page.
   *
   * @returns a page of changes.
   */
  public async changes(since: string | number, { batchSize = 100 }: { readonly batchSize?: number } = {}): Promise<DatabaseChanges> {
    const changesUrl = new URL('_changes', this.baseUrl);
    changesUrl.searchParams.set('limit', batchSize.toFixed());
    changesUrl.searchParams.set('include_docs', 'true');
    changesUrl.searchParams.set('selector', '_filter');
    changesUrl.searchParams.set('since', since.toString());

    const filter = { name: { $gt: null } };

    return await this.https('post', changesUrl, filter) as any;
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
  private https(method: string, url: URL, body?: { [key: string]: unknown }, attempt = 1): Promise<{ [key: string]: unknown }> {
    return new Promise((ok, ko) => {
      const retry = () => setTimeout(
        () => {
          console.log(`Retrying ${method.toUpperCase()} ${url.toString()}`);
          this.https(method, url, body, attempt + 1).then(ok, ko);
        },
        Math.min(500 * attempt, 5_000),
      );

      const headers: OutgoingHttpHeaders = {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
      };
      if (body) {
        headers['Content-Type'] = 'application/json';
      }
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
            const error = new Error(`[FATAL] Request failed: ${method.toUpperCase()} ${url.toString()}`);
            Error.captureStackTrace(error);
            return ko(error);
          }
          // Transient (server) errors:
          if (res.statusCode >= 500 && res.statusCode < 600) {
            console.error(`[RETRYABLE] HTTP ${res.statusCode} (${res.statusMessage}) - ${method.toUpperCase()} ${url.toString()}`);
            // Call again after a short back-off
            return retry();
          }
          // Permanent (client) errors:
          if (res.statusCode >= 400 && res.statusCode < 500) {
            const error = new Error(`[FATAL] HTTP ${res.statusCode} (${res.statusMessage}) - ${method.toUpperCase()} ${url.toString()}`);
            Error.captureStackTrace(error);
            return ko(error);
          }

          let data = Buffer.alloc(
            typeof res.headers['content-length'] === 'string'
              ? Number.parseInt(res.headers['content-length'])
              : 4_096,
          );
          let dataLength = 0;

          res.once('error', (err: Error & { code?: string }) => {
            if (err.code === 'ECONNRESET') {
              // Transient networking problem?
              console.error(`[RETRYABLE] ${err.code} - ${method.toUpperCase()} ${url.toString()}`);
              res.removeAllListeners('close');
              retry();
            } else {
              debugger;
              ko(err);
            }
          });
          res.on('data', (chunk) => {
            const buffer = chunk = Buffer.from(chunk);
            if (dataLength + buffer.length > data.length) {
              // Buffer is not large enough, extend it to fit new data...
              const existing = data;
              data = Buffer.alloc(data.length + Math.max(buffer.length, 4_096));
              existing.copy(data);
            }
            buffer.copy(data, dataLength);
            dataLength += buffer.length;
          });
          res.once('close', () => {
            // Ensure buffer is trimmed to correct length.
            data = data.subarray(0, dataLength);
            try {
              if (res.headers['content-encoding'] === 'gzip') {
                data = gunzipSync(data);
              }
              ok(JSON.parse(data.toString('utf-8')));
            } catch (error) {
              if ((error as Error & { code?: string }).code === 'Z_BUF_ERROR') {
                // Truncated payload... Connection cut too early?
                console.error(`[RETRYABLE] Z_BUF_ERROR (${error.message}) - ${method.toUpperCase()} ${url.toString()}`);
                retry();
              } else {
                debugger;
                ko(error);
              }
            }
          });
        },
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
  readonly changes: ReadonlyArray<{ readonly rev: string; }>;

  /**
   * The ID of the document that has changed.
   */
  readonly id: string;

  /**
   * The sequence ID for this change in the stream.
   */
  readonly seq: string | number;

  /**
   * Whether this change corresponds to this document being deleted.
   */
  readonly deleted: boolean;

  /**
   * If present, the resolved document after the change has been applied.
   */
  readonly doc?: { readonly [key: string]: unknown };
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
