import { metricScope, Configuration, Unit } from 'aws-embedded-metrics';
import type { AWSError, S3 } from 'aws-sdk';
import * as https from 'https';
import * as JSONStream from 'JSONStream';
import * as aws from '../backend/shared/aws.lambda-shared';
import { requireEnv } from '../backend/shared/env.lambda-shared';
import { Readable } from 'stream';

Configuration.namespace = 'ConstructHub';

export async function handler(_: any) {

  const packageName = requireEnv('PACKAGE_NAME');
  const stateBucket = requireEnv('PACKAGE_CANARY_BUCKET_NAME');
  const constructHubEndpoint = requireEnv('CONSTRUCT_HUB');

  const stateService = new CanaryStateService(stateBucket);
  const constructHub = new ConstructHub(constructHubEndpoint);

  let state = await stateService.load(packageName);

  try {

    if (!state.availableAt) {

      // the version is not available yet - check again
      const available = await constructHub.isAvailable(packageName, state.version);
      if (available) {
        state.availableAt = new Date();
      }

    } else {

      // the version is available - start tracking a new one
      const latest = await stateService.latest(packageName);
      if (latest.version !== state.version) {
        // only reset if its a new version, otherwise our SLA will
        // be incorrectly reset. note this means that until a new version is available,
        // we will be reporting the last known SLA value (which is desirable)
        state = latest;
      }
    }

    if (state.availableAt) {
      const sla = (state.availableAt.getTime(), state.publishedAt.getTime()) / 1000;
      await constructHub.reportSLA(sla);
    }

  } finally {
    await stateService.save(packageName, state);
  }

}

class ConstructHub {

  constructor(private readonly baseUrl: string) {}

  /**
   * Check if the package version is available on the hub.
   */
  public async isAvailable(packageName: string, packageVersion: string) {
    return this.isSearchable(packageName, packageVersion);
  }

  /**
   * Report SLA metric
   */
  public async reportSLA(seconds: number) {

    console.log(`Reporting SLA value: ${seconds}s`);
    await metricScope((metrics) => () => {
      // Clear out default dimensions as we don't need those. See https://github.com/awslabs/aws-embedded-metrics-node/issues/73.
      metrics.setDimensions();
      metrics.putMetric('SLA', seconds, Unit.Seconds);
    })();
  }

  public async isSearchable(packageName: string, packageVersion: string): Promise<boolean> {

    const catalog = await getJSON(`${this.baseUrl}/catalog.json`);
    const filtered = catalog.packages.filter((p: any) => p.name === packageName && p.version === packageVersion);

    if (filtered.length > 1) {
      throw new Error(`Found multiple entries for ${packageName}@${packageVersion} in catalog`);
    }

    return filtered.length === 1;
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
  public async load(packageName: string): Promise<CanaryState> {

    console.log(`Loading state for package '${packageName}'`);

    const key = this.key(packageName);
    const url = this.url(packageName);

    console.log(`Fetching: ${url}`);
    const data = await aws.s3().getObject({ Bucket: this.bucketName, Key: key }).promise()
      .catch((err: AWSError) => err.code !== 'NoSuchKey'
        ? Promise.reject(err)
        : Promise.resolve({ /* no data */ } as S3.GetObjectOutput));

    if (!data?.Body) {
      console.log(`Not found: ${url}`);
      return this.latest(packageName);
    }

    console.log(`Loaded: ${url}`);
    const stored = JSON.parse(data.Body.toString('utf-8'));
    return {
      version: stored.version,
      publishedAt: new Date(stored.publishedAt),
    };
  }

  /**
   * Create a state from the latest version of the package.
   */
  public async latest(packageName: string): Promise<CanaryState> {

    console.log(`Fetching latest version information from NPM: ${packageName}`);
    const { version } = await getJSON(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`);
    const publishedAt = await getJSON(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, ['time', version]);

    console.log(`Package: ${packageName} | Version : ${version} | Published At: ${publishedAt}`);

    return { version, publishedAt: new Date(publishedAt) };
  }

  private key(packageName: string): string {
    return `${packageName}.state`;
  }

  private url(packageName: string) {
    return `s3://${this.bucketName}/${this.key(packageName)}`;
  }


}

interface CanaryState {
  /**
   * The version we are tracking.
   */
  version: string;

  /**
   * The publish date of the version.
   */
  publishedAt: Date;

  /**
   * The date at which the version is available on the hub.
   */
  availableAt?: Date;
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
          json.once('data', (data) => {
            ok(data);
          });
          json.once('end', () => {
            // NOTE - If the `data` event fired already, the `ko` call here will
            // simply be ignored, which is the desired behavior.
            const err = new Error(`No JSON value found in response stream`);
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
