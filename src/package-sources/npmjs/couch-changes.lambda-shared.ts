import * as buffer from 'buffer';
import { EventEmitter } from 'events';
import { OutgoingHttpHeaders } from 'http';
import { Agent, request } from 'https';
import { URL } from 'url';
import { gunzipSync } from 'zlib';

/**
 * The maximum length of a response body we can accept that we will be able to
 * successfully parse out. There is a limit in node on how big a string instance
 * can be, and `JSON.parse` only operates on string instances. If we get too
 * many unicode code-points, we will simply not be able to parse the result out,
 * and will thow an error with an appropriate error message.
 */
const MAX_DATA_LENGTH = Math.min(
  // NOTE: MAX_STRING_LENGTH is expressed in UTF-16 code units. We expect to receive JSON
  // which ultimately is UTF-8-encoded text. An UTF-16 code unit is 32 bits, but this
  // maps to between 8 and 32 bits in UTF-8... Consequently, we can't allow more than
  // MAX_StRING_LENGTH / 4 if we want to be certain we can stringify the buffer.
  Math.floor(buffer.constants.MAX_STRING_LENGTH / 4),
  // This is the maximum length of a Buffer instance. We cannot technically accept any
  // more data than this... so we won't even be trying to.
  buffer.constants.MAX_LENGTH,
);

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
  public async changes(since: string | number, opts?: { readonly batchSize?: number }): Promise<DatabaseChanges> {
    const batchSize = opts?.batchSize ?? 100;

    const changesUrl = new URL('_changes', this.baseUrl);
    changesUrl.searchParams.set('include_docs', 'true');
    changesUrl.searchParams.set('limit', batchSize.toFixed());
    changesUrl.searchParams.set('selector', '_filter');
    changesUrl.searchParams.set('seq_interval', batchSize.toFixed());
    changesUrl.searchParams.set('since', since.toString());
    changesUrl.searchParams.set('timeout', '20000' /* ms */);

    const filter = { name: { $gt: null } };

    try {
      return await this.https('post', changesUrl, filter) as any;
    } catch (err) {
      if (err instanceof ResponseTooLargeError && batchSize > 1) {
        // The response was too large, try again, but with a smaller batch size
        const smallerBatchSize = Math.max(1, Math.floor(batchSize / 2));
        console.log(`Batch of ${batchSize} from ${since} was too large... Trying again with batch size of ${smallerBatchSize}`);
        return this.changes(since, { ...opts, batchSize: smallerBatchSize });
      }
      // Else simply forward the error out again...
      return Promise.reject(err);
    }
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
          console.log(`Retrying ${method.toUpperCase()} ${url}`);
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
      console.log(`Request: ${method.toUpperCase()} ${url}`);
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
            const error = new Error(`[FATAL] Request failed: ${method.toUpperCase()} ${url}`);
            Error.captureStackTrace(error);
            return ko(error);
          }

          console.log(`Response: ${method.toUpperCase()} ${url} => HTTP ${res.statusCode} (${res.statusMessage})`);

          // Transient (server) errors:
          if (res.statusCode >= 500 && res.statusCode < 600) {
            console.error(`[RETRYABLE] HTTP ${res.statusCode} (${res.statusMessage}) - ${method.toUpperCase()} ${url}`);
            // Call again after a short back-off
            return retry();
          }
          // Permanent (client) errors:
          if (res.statusCode >= 400 && res.statusCode < 500) {
            const error = new Error(`[FATAL] HTTP ${res.statusCode} (${res.statusMessage}) - ${method.toUpperCase()} ${url}`);
            Error.captureStackTrace(error);
            return ko(error);
          }

          res.once('error', (err: Error & { code?: string }) => {
            // Don't call the `close` handler - we are reporting failure or retrying in a new request here...
            res.removeAllListeners('close');
            if (err.code === 'ECONNRESET') {
              // Transient networking problem?
              console.error(`[RETRYABLE] ${err.code} - ${method.toUpperCase()} ${url}`);
              retry();
            } else {
              ko(err);
            }
          });

          // We'll increase the buffer size by at least this much if the buffer we currently have is
          // not large enough. CouchDB typically sends response in `chunked` encoding, so we don't
          // know the full length of the response in advance... We hence try to avoid doing too many
          // expensive copies if the response is very large (it can be!).
          const bufferIncrements = 1_048_576; /* 1MiB */
          let data = Buffer.alloc(
            typeof res.headers['content-length'] === 'string'
              ? Number.parseInt(res.headers['content-length'])
              : bufferIncrements,
          );
          let dataLength = 0;
          res.on('data', (chunk) => {
            const chunkBuffer = chunk = Buffer.from(chunk);
            // Check if we still have capacity to accept that data without going too large to parse...
            if (dataLength + chunkBuffer.length > MAX_DATA_LENGTH) {
              console.log(`Response too large (> ${MAX_DATA_LENGTH}), aborting: ${method.toUpperCase()} ${url}`);
              // We won't be able to stringify this... no point in continuing. Calling destroy with
              // an error will cause the `error` event to be emitted, then the `close` event will be
              // emitted. Any outstanding data will be dropped, the socket will be destroyed.
              req.destroy(new ResponseTooLargeError(method, url));
              return;
            }
            if (dataLength + chunkBuffer.length > data.length) {
              // Buffer is not large enough, extend it to fit new data...
              const existing = data;
              data = Buffer.alloc(Math.min(data.length + Math.max(chunkBuffer.length, bufferIncrements), buffer.constants.MAX_LENGTH));
              existing.copy(data);
            }
            chunkBuffer.copy(data, dataLength);
            dataLength += chunkBuffer.length;
          });

          res.once('close', () => {
            // Ensure buffer is trimmed to correct length.
            data = data.subarray(0, dataLength);
            try {
              if (res.headers['content-encoding'] === 'gzip') {
                data = gunzipSync(data);
              }
              console.log(`Response: ${method.toUpperCase()} ${url} => ${dataLength} bytes`);
              try {
                ok(JSON.parse(data.toString('utf-8')));
              } catch (err) {
                if (err.code === 'ERR_STRING_TOO_LONG') {
                  ko(new ResponseTooLargeError(method, url, err));
                } else {
                  ko(err);
                }
              }
            } catch (error) {
              if ((error as Error & { code?: string }).code === 'Z_BUF_ERROR') {
                // Truncated payload... Connection cut too early?
                console.error(`[RETRYABLE] Z_BUF_ERROR (${error.message}) - ${method.toUpperCase()} ${url}`);
                retry();
              } else {
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

class ResponseTooLargeError extends Error {
  public readonly name = ResponseTooLargeError.name;

  public constructor(method: string, url: URL, public readonly cause?: any) {
    super(`The response to ${method.toUpperCase()} ${url} is too large, and cannot be JSON.parse'd.`);
    Error.captureStackTrace(this, ResponseTooLargeError);
  }
}
