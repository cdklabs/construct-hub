import * as https from 'https';
import { json } from 'node:stream/consumers';
import { Readable } from 'stream';
import { createGunzip } from 'zlib';
import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { metricScope, Configuration, Unit } from 'aws-embedded-metrics';
import {
  METRICS_NAMESPACE,
  MetricName,
  Environment,
  ObjectKey,
} from './constants';
import { CatalogModel } from '../../../backend';
import { S3_CLIENT } from '../../../backend/shared/aws.lambda-shared';
import { requireEnv } from '../../../backend/shared/env.lambda-shared';

Configuration.namespace = METRICS_NAMESPACE;

const REPLICA_REQUEST_TIMEOUT_MS = 30_000;

/**
 * This package canary monitors the availability of the versions of a specified
 * package in the ConstructHub catalog. It publishes metrics that help
 * understand how much time passes between a package appearing in the public
 * registry and it's availability in the ConstructHub instance.
 *
 * From the moment a package has been published, and until it appeared in
 * catalog, the `MetricName.DWELL_TIME` metric is emitted.
 *
 * Once the package has appeared in catalog, and until a new package version is
 * identified in npmjs.com, the `MetricName.TIME_TO_CATALOG` metric is emitted.
 *
 * If a new package version is published before the previous one has appeared
 * in catalog, both versions will be tracked at the same time, and the metrics
 * will receive one sample per tracked version.
 */
export async function handler(event: unknown): Promise<void> {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  const packageName = requireEnv(Environment.PACKAGE_NAME);
  const stateBucket = requireEnv(Environment.PACKAGE_CANARY_BUCKET_NAME);
  const constructHubEndpoint = requireEnv(Environment.CONSTRUCT_HUB_BASE_URL);

  const stateService = new CanaryStateService(stateBucket);
  const constructHub = new ConstructHub(constructHubEndpoint);

  try {
    const latest = await stateService.latest(packageName);
    const state: CanaryState = (await stateService.load(packageName)) ?? {
      // If we did not have any state, we'll bootstrap using the current latest version.
      latest: {
        ...latest,
        // If that latest version is ALREADY in catalog, pretend it was
        // "instantaneously" there, so we avoid possibly reporting an breach of
        // SLA alarm, when we really just observed presence of the package in
        // catalog too late, for example on first deployment of the canary.
        availableAt: (await constructHub.isInCatalog(
          packageName,
          latest.version
        ))
          ? latest.publishedAt
          : undefined,
      },
      pending: {},
    };

    console.log(`Initial state: ${JSON.stringify(state, null, 2)}`);

    // If the current "latest" isn't the one from state, it needs updating.
    updateLatestIfNeeded(state, latest);

    try {
      await metricScope((metrics) => async () => {
        // Clear out default dimensions as we don't need those. See https://github.com/awslabs/aws-embedded-metrics-node/issues/73.
        metrics.setDimensions({});
        metrics.putMetric(
          MetricName.TRACKED_VERSION_COUNT,
          Object.keys(state.pending).length + 1,
          Unit.Count
        );
        metrics.putMetric(
          MetricName.NPM_REPLICA_DOWN,
          (await stateService.isNpmReplicaDown()) ? 1 : 0,
          Unit.None
        );
      })();

      for (const versionState of [
        state.latest,
        ...Object.values(state.pending ?? {}),
      ]) {
        console.log(
          `Checking state of ${versionState.version}, current: ${JSON.stringify(
            versionState,
            null,
            2
          )}`
        );

        await metricScope((metrics) => async () => {
          // Clear out default dimensions as we don't need those. See https://github.com/awslabs/aws-embedded-metrics-node/issues/73.
          metrics.setDimensions({});
          metrics.setProperty('PackageName', packageName);
          metrics.setProperty('PackageVersion', versionState.version);
          metrics.setProperty(
            'IsLatest',
            state.latest.version === versionState.version
          );

          if (!versionState.availableAt) {
            if (versionState.version === state.latest.version) {
              if (
                await constructHub.isInCatalog(
                  packageName,
                  versionState.version
                )
              ) {
                versionState.availableAt = new Date();
              }
            } else {
              // Non-current versions will probably never make it to catalog (they're older than the
              // current version), so instead, we check whether they have TypeScript documentation.
              if (
                await constructHub.hasTypeScriptDocumentation(
                  packageName,
                  versionState.version
                )
              ) {
                versionState.availableAt = new Date();
              }
            }
          }

          if (versionState.availableAt) {
            // Tells us how long it's taken for the package to make it to catalog after it was published.
            metrics.putMetric(
              MetricName.TIME_TO_CATALOG,
              (versionState.availableAt.getTime() -
                versionState.publishedAt.getTime()) /
                1_000,
              Unit.Seconds
            );

            // Stop tracking that version, as it's now available.
            if (versionState.version in state.pending) {
              delete state.pending[versionState.version];
            }
          } else {
            // Tells us how long we've been waiting for this version to show up, so far.
            metrics.putMetric(
              MetricName.DWELL_TIME,
              (Date.now() - versionState.publishedAt.getTime()) / 1_000,
              Unit.Seconds
            );
          }

          // Noting that we did not enocunter a gateway error, so the metric has a nice and clean 0
          // value instead of having to treat missing data as not breaching.
          metrics.putMetric(MetricName.HTTP_GATEWAY_ERRORS, 0, Unit.Count);
        })();
      }
    } finally {
      await stateService.save(packageName, state);
    }
  } catch (error: any) {
    if (
      error instanceof HTTPError &&
      error.httpStatusCode &&
      error.httpStatusCode >= 500
    ) {
      // This is an HTTP 5XX from a dependency, so we'll log this out, and pretend it did not fail...
      console.error(
        'HTTP 5XX from a dependency, assuming this is transient:',
        error
      );
      await metricScope((metrics) => async () => {
        // Clear out default dimensions as we don't need those. See https://github.com/awslabs/aws-embedded-metrics-node/issues/73.
        metrics.setDimensions({});
        metrics.setProperty('ErrorCode', error.httpStatusCode);
        metrics.setProperty('ErrorMessage', error.message);

        metrics.putMetric(MetricName.HTTP_GATEWAY_ERRORS, 1, Unit.Count);
      })();
    } else if (error instanceof TimeoutError) {
      console.error(
        `Request timeout from a dependency, assuming this is transient:`,
        error
      );
      await metricScope((metrics) => async () => {
        // Clear out default dimensions as we don't need those. See https://github.com/awslabs/aws-embedded-metrics-node/issues/73.
        metrics.setDimensions({});
        metrics.setProperty('ErrorCode', 'REQUEST_TIMEOUT');
        metrics.setProperty('ErrorMessage', error.message);

        // This is sligthly abusive, but... HTTP 504 (Gateway Timeout) from the npm replica are
        // returned after more than 30 seconds has passed and this is way too long... so we
        // approximate a bit here...
        metrics.putMetric(MetricName.HTTP_GATEWAY_ERRORS, 1, Unit.Count);
      })();
    } else {
      // This not an HTTP 5XX from a dependency, so we'll just rethrow and fail...
      throw error;
    }
  }
}

class ConstructHub {
  #catalog?: CatalogModel;

  constructor(private readonly baseUrl: string) {}

  /**
   * Determines whether the specified package version is present in the catalog
   * object or not.
   *
   * @param packageName    the name of the checked package.
   * @param packageVersion the version of the checked package.
   *
   * @returns `true` IIF the exact package version is found in the catalog.
   */
  public async isInCatalog(
    packageName: string,
    packageVersion: string
  ): Promise<boolean> {
    const catalog = await this.getCatalog();
    const filtered = catalog.packages.filter(
      (p: any) => p.name === packageName && p.version === packageVersion
    );

    if (filtered.length > 1) {
      throw new Error(
        `Found multiple entries for ${packageName}@${packageVersion} in catalog`
      );
    }

    return filtered.length === 1;
  }

  /**
   * Checks whether TypeScript documentation exists in ConstructHub for the
   * specified package version.
   *
   * @param packageName    the name of the checked package.
   * @param packageVersion the version of the checked package.
   *
   * @returns `true` IIF the `docs-typescript.md` document exists for the
   *          specified package.
   */
  public async hasTypeScriptDocumentation(
    packageName: string,
    packageVersion: string
  ): Promise<boolean> {
    return new Promise((ok, ko) => {
      const url = `${this.baseUrl}/data/${packageName}/v${packageVersion}/docs-typescript.md`;
      https
        .request(url, { method: 'HEAD' }, (res) => {
          if (res.statusCode === 200) {
            // This returns HTTP 200 with text/html if it's a 404, due to how
            // we configured CloudFront behaviors.
            return ok(
              !!res.headers['content-type']?.startsWith('text/markdown')
            );
          }
          const err = new HTTPError(
            res.statusCode,
            `HEAD ${url} -- HTTP ${res.statusCode} (${res.statusMessage})`
          );
          Error.captureStackTrace(err);
          ko(err);
        })
        .end();
    });
  }

  private async getCatalog(): Promise<CatalogModel> {
    if (this.#catalog) {
      return this.#catalog;
    }
    return (this.#catalog = await getJSON(`${this.baseUrl}/catalog.json`));
  }
}

export class CanaryStateService {
  constructor(private readonly bucketName: string) {}

  /**
   * Save the state to the bucket.
   */
  public async save(packageName: string, state: CanaryState) {
    const url = this.url(packageName);

    console.log(`Saving to ${url}: ${JSON.stringify(state, null, 2)}`);
    await S3_CLIENT.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.key(packageName),
        Body: JSON.stringify(state, null, 2),
        ContentType: 'application/json',
      })
    );
  }

  /**
   * Load the state file for this package from the bucket.
   */
  public async load(packageName: string): Promise<CanaryState | undefined> {
    console.log(`Loading state for package '${packageName}'`);

    const objectKey = this.key(packageName);
    const url = this.url(packageName);

    console.log(`Fetching: ${url}`);
    try {
      const res = await S3_CLIENT.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: objectKey })
      );

      const content = await res?.Body?.transformToString('utf-8');
      if (!content) {
        console.log(`Not found: ${url}`);
        return undefined;
      }

      console.log(`Loaded: ${url}`);
      return JSON.parse(content, (key, value) => {
        if (key === 'publishedAt' || key === 'availableAt') {
          return new Date(value);
        }
        return value;
      });
    } catch (error: any) {
      if (error instanceof NoSuchKey || error.name === 'NoSuchKey') {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Create a state from the latest version of the package.
   */
  public async latest(packageName: string): Promise<CanaryState['latest']> {
    console.log(`Fetching latest version information from NPM: ${packageName}`);
    const version = (
      await getJSON(
        `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`
      )
    ).version;
    const publishedAt = (
      await getJSON(
        `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
      )
    ).time[version];

    console.log(
      `Package: ${packageName} | Version : ${version} | Published At: ${publishedAt}`
    );

    return { version, publishedAt: new Date(publishedAt) };
  }

  public async isNpmReplicaDown(): Promise<boolean> {
    try {
      await getJSON('https://replicate.npmjs.com/', {
        timeoutMillis: REPLICA_REQUEST_TIMEOUT_MS,
      });
      return false;
    } catch (e) {
      return true;
    }
  }

  private key(packageName: string): string {
    return `${ObjectKey.STATE_PREFIX}${packageName}${ObjectKey.STATE_SUFFIX}`;
  }

  private url(packageName: string) {
    return `s3://${this.bucketName}/${this.key(packageName)}`;
  }
}

export class HTTPError extends Error {
  public constructor(
    public readonly httpStatusCode: number | undefined,
    message: string
  ) {
    super(message);
    Error.captureStackTrace(this, HTTPError);
  }
}

export class TimeoutError extends Error {
  public constructor(message: string) {
    super(message);
    Error.captureStackTrace(this, TimeoutError);
  }
}

interface CanaryState {
  /**
   * The latest package version, as of the last execution of the canary.
   */
  latest: {
    /**
     * The version we are tracking.
     */
    readonly version: string;

    /**
     * The publish date of the version.
     */
    readonly publishedAt: Date;

    /**
     * The date at which the version is available on the hub.
     */
    availableAt?: Date;
  };

  /**
   * Each existing, but not-yet-found versions that are still tracked.
   */
  pending: {
    [version: string]: {
      /**
       * The version we are tracking.
       */
      readonly version: string;

      /**
       * The publish date of the version.
       */
      readonly publishedAt: Date;

      /**
       * These pending packages are NEVER available at this point.
       */
      availableAt: undefined;
    };
  };
}

/**
 * Makes a request to the provided URL and returns the response after having
 * parsed it from JSON.
 *
 * @param url the URL to get.
 * @param jsonPath a JSON path to extract only a subset of the object.
 * @param timeoutMillis the socket timeout, in milliseconds.
 */
function getJSON(
  url: string,
  { timeoutMillis }: { jsonPath?: string[]; timeoutMillis?: number } = {}
): Promise<any> {
  return new Promise((ok, ko) => {
    https
      .get(
        url,
        {
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'identity',
            'npm-replication-opt-in': 'true', // can be deleted after May 29: https://github.com/orgs/community/discussions/152515
          },
          timeout: timeoutMillis,
        },
        (res) => {
          if (res.statusCode !== 200) {
            const error = new HTTPError(
              res.statusCode,
              `GET ${url} - HTTP ${res.statusCode} (${res.statusMessage})`
            );
            Error.captureStackTrace(error);
            return ko(error);
          }

          res.once('error', ko);

          res.once('timeout', () => {
            // Upon socket timeout, fail with a TimeoutError
            ko(
              new TimeoutError(
                `Request timed out (after ${
                  timeoutMillis ?? 'N/A'
                } ms): GET ${url}`
              )
            );
          });

          const plainPayload =
            res.headers['content-encoding'] === 'gzip' ? gunzip(res) : res;
          return json(plainPayload)
            .then((parsed) => ok(parsed as any))
            .catch((err) => ko(err));
        }
      )
      .once('timeout', () => {
        // Upon socket timeout, fail with a TimeoutError
        ko(
          new TimeoutError(
            `Request timed out (after ${timeoutMillis ?? 'N/A'} ms): GET ${url}`
          )
        );
      });
  });
}

/**
 * Updates the `latest` property of `state` ti the provided `latest` value,
 * unless this is already the current latest.
 *
 * If the previous latest version does not have the `availableAt` property, adds
 * that to the `pending` set.
 *
 * @param state  the state to be updated.
 * @param latest the current "latest" version of the tracked package.
 */
function updateLatestIfNeeded(
  state: CanaryState,
  latest: CanaryState['latest']
): void {
  if (state.latest.version === latest.version) {
    return;
  }

  // If the current "latest" isn't available yet, add it to the `pending` versions.
  if (state.latest.availableAt == null) {
    // The TypeScript version of jsii doesn't do control flow analysis well enough here to
    // determine that the`if` branch guarantees `availableAt` is undefined here.
    state.pending[state.latest.version] = {
      ...state.latest,
      availableAt: undefined,
    };
  }

  state.latest = latest;
}

function gunzip(readable: Readable): Readable {
  const gz = createGunzip();
  readable.pipe(gz, { end: true });
  return gz;
}
