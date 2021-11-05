import * as https from 'https';
import { Readable } from 'stream';
import { metricScope, Configuration, Unit } from 'aws-embedded-metrics';
import type { AWSError, S3 } from 'aws-sdk';
import * as JSONStream from 'JSONStream';
import { CatalogModel } from '../../../backend';
import * as aws from '../../../backend/shared/aws.lambda-shared';
import { requireEnv } from '../../../backend/shared/env.lambda-shared';
import { METRICS_NAMESPACE, MetricName, Environment, ObjectKey } from './constants';

Configuration.namespace = METRICS_NAMESPACE;

/**
 * This package canary monitors the availability of the versions of a specified
 * package in the ConstructHub catalog. It publishes metrics that help
 * understand how much time passes between a pakcage appearing in the public
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

  const latest = await stateService.latest(packageName);
  const state: CanaryState = await stateService.load(packageName)
    // If we did not have any state, we'll bootstrap using the current latest version.
    ?? {
      latest: {
        ...latest,
        // If that latest version is ALREADY in catalog, pretend it was
        // "instantaneously" there, so we avoid possibly reporting an breach of
        // SLA alarm, when we really just observed presence of the package in
        // catalog too late.
        availableAt: await constructHub.isInCatalog(packageName, latest.version)
          ? latest.publishedAt
          : undefined,
      },
      pending: {},
    };

  // If the current "latest" isn't the one from state, update it.
  if (state.latest.version !== latest.version) {
    // If the current "latest" isn't available yet, keep tracking it.
    if (state.latest.availableAt == null) {
      state.pending = state.pending ?? {};
      // The TypeScript version of jsii doesn't do control flow analysis well enough here to
      // determine that the`if` branch guarantees `availableAt` is undefined here.
      state.pending[state.latest.version] = { ...state.latest, availableAt: undefined };
    }
    state.latest = latest;
  }

  try {
    await metricScope((metrics) => () => {
      // Clear out default dimensions as we don't need those. See https://github.com/awslabs/aws-embedded-metrics-node/issues/73.
      metrics.setDimensions();
      metrics.putMetric(MetricName.TRACKED_VERSION_COUNT, Object.keys(state.pending).length + 1, Unit.Count);
    })();

    for (const versionState of [state.latest, ...Object.values(state.pending ?? {})]) {
      await metricScope((metrics) => async () => {
        // Clear out default dimensions as we don't need those. See https://github.com/awslabs/aws-embedded-metrics-node/issues/73.
        metrics.setDimensions();
        metrics.setProperty('PackageName', packageName);
        metrics.setProperty('PackageVersion', versionState.version);
        metrics.setProperty('IsLatest', state.latest.version === versionState.version);

        if (!versionState.availableAt) {
          if (versionState.version === state.latest.version) {
            if (await constructHub.isInCatalog(packageName, versionState.version)) {
              versionState.availableAt = new Date();
            }
          } else {
            // Non-current versions will probably never make it to catalog (they're older than the
            // current version), so instead, we check whether they have TypeScript documentation.
            if (await constructHub.hasTypeScriptDocumentation(packageName, versionState.version)) {
              versionState.availableAt = new Date();
            }
          }
        }

        if (versionState.availableAt) {
          // Tells us how long it's taken for the package to make it to catalog after it was published.
          metrics.putMetric(
            MetricName.TIME_TO_CATALOG,
            (versionState.availableAt.getTime() - versionState.publishedAt.getTime()) / 1_000,
            Unit.Seconds,
          );

          // Stop tracking that version, as it's now available.
          if (state.pending) {
            delete state.pending[versionState.version];
          }
        } else {
          // Tells us how long we've been waiting for this version to show up, so far.
          metrics.putMetric(
            MetricName.DWELL_TIME,
            (Date.now() - versionState.publishedAt.getTime()) / 1_000,
            Unit.Seconds,
          );
        }
      })();
    }
  } finally {
    await stateService.save(packageName, state);
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
  public async isInCatalog(packageName: string, packageVersion: string): Promise<boolean> {

    const catalog = await this.getCatalog();
    const filtered = catalog.packages.filter((p: any) => p.name === packageName && p.version === packageVersion);

    if (filtered.length > 1) {
      throw new Error(`Found multiple entries for ${packageName}@${packageVersion} in catalog`);
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
  public async hasTypeScriptDocumentation(packageName: string, packageVersion: string): Promise<boolean> {
    return new Promise((ok, ko) => {
      const url = `${this.baseUrl}/data/${packageName}/v${packageVersion}/docs-typescript.md`;
      https.request(
        url,
        { method: 'HEAD' },
        (res) => {
          if (res.statusCode === 200) {
            // This returns HTTP 200 with text/html if it's a 404, due to how
            // we configured CloudFront behaviors.
            return ok(res.headers['content-type']?.startsWith('text/markdown'));
          }
          const err = new Error(`HEAD ${url} -- HTTP ${res.statusCode} (${res.statusMessage})`);
          Error.captureStackTrace(err);
          ko(err);
        },
      );
    });
  }

  private async getCatalog(): Promise<CatalogModel> {
    if (this.#catalog) {
      return this.#catalog;
    }
    return this.#catalog = await getJSON(`${this.baseUrl}/catalog.json`);
  }
}

class CanaryStateService {

  constructor(private readonly bucketName: string) {}

  /**
   * Save the state to the bucket.
   */
  public async save(packageName: string, state: CanaryState) {

    const url = this.url(packageName);

    console.log(`Saving: ${url}`);
    await aws.s3().putObject({
      Bucket: this.bucketName,
      Key: this.key(packageName),
      Body: JSON.stringify(state, null, 2),
      ContentType: 'application/json',
    }).promise();

  }

  /**
   * Load the state file for this package from the bucket.
   */
  public async load(packageName: string): Promise<CanaryState | undefined> {

    console.log(`Loading state for package '${packageName}'`);

    const objectKey = this.key(packageName);
    const url = this.url(packageName);

    console.log(`Fetching: ${url}`);
    const data = await aws.s3().getObject({ Bucket: this.bucketName, Key: objectKey }).promise()
      .catch((err: AWSError) => err.code !== 'NoSuchKey'
        ? Promise.reject(err)
        : Promise.resolve({ /* no data */ } as S3.GetObjectOutput));

    if (!data?.Body) {
      console.log(`Not found: ${url}`);
      return undefined;
    }

    console.log(`Loaded: ${url}`);
    return JSON.parse(data.Body.toString('utf-8'), (key, value) => {
      if (key === 'publishedAt' || key === 'availableAt') {
        return new Date(value);
      }
      return value;
    });
  }

  /**
   * Create a state from the latest version of the package.
   */
  public async latest(packageName: string): Promise<CanaryState['latest']> {

    console.log(`Fetching latest version information from NPM: ${packageName}`);
    const version = await getJSON(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, ['version']);
    const publishedAt = await getJSON(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, ['time', version]);

    console.log(`Package: ${packageName} | Version : ${version} | Published At: ${publishedAt}`);

    return { version, publishedAt: new Date(publishedAt) };
  }

  private key(packageName: string): string {
    return `${ObjectKey.STATE_PREFIX}${packageName}${ObjectKey.STATE_SUFFIX}`;
  }

  private url(packageName: string) {
    return `s3://${this.bucketName}/${this.key(packageName)}`;
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
 */
function getJSON(url: string, jsonPath?: string[]): Promise<any> {
  return new Promise((ok, ko) => {
    https.get(url, { headers: { 'Accept': 'application/json', 'Accept-Encoding': 'identity' } }, (res) => {
      let chunks = new Array<Buffer>();
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.once('error', ko);
      res.once('close', () => {
        if (res.statusCode !== 200) {
          const err = new Error(`GET ${url} -- HTTP ${res.statusCode} (${res.statusMessage})`);
          Error.captureStackTrace(err);
          ko(err);
        } else {
          const json = JSONStream.parse(jsonPath ?? true);
          readerFrom(chunks).pipe(json);
          json.once('error', ko);
          json.once('data', (data: any) => {
            ok(data);
          });
          json.once('end', () => {
            // NOTE - If the `data` event fired already, the `ko` call here will
            // simply be ignored, which is the desired behavior.
            const err = new Error('No JSON value found in response stream');
            Error.captureStackTrace(err);
            ko(err);
          });
        }
      });
    });
  });
}

function readerFrom(buffers: readonly Buffer[]): NodeJS.ReadableStream {
  let reader = new Readable();
  for (const buffer of buffers) {
    reader.push(buffer);
  }
  reader.push(null);
  return reader;
}

void handler({});
