import { metricScope, Configuration, Unit } from 'aws-embedded-metrics';
import { AWSError, S3 } from 'aws-sdk';
import * as aws from '../backend/shared/aws.lambda-shared';
import { CATALOG_KEY } from '../backend/shared/constants';
import { shellOut } from '../backend/shared/shell-out.lambda-shared';

Configuration.namespace = 'ConstructHub';

function env(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} environment variable is required`);
  }
  return value;
}

export async function handler(_: any) {

  const packageName = env('PACKAGE_NAME');
  const stateBucket = env('PACKAGE_CANARY_BUCKET_NAME');
  const dataBucket = env('PACKAGE_DATA_BUCKET_NAME');

  const stateService = new CanaryStateService(stateBucket);
  const constructHub = new ConstructHub(dataBucket);

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
      const sla = (state.publishedAt.getTime() - state.availableAt.getTime()) / 1000;
      await constructHub.reportSLA(sla);
    }

  } finally {
    await stateService.save(packageName, state);
  }

}

class ConstructHub {

  constructor(private readonly dataBucket: string) {}

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
      metrics.putMetric('SLA', seconds, Unit.Count);
    })();
  }

  public async isSearchable(packageName: string, packageVersion: string): Promise<boolean> {

    // TODO - This should be implemented with pupeteer and frontend queries

    const catalogFile = await aws.s3().getObject({ Bucket: this.dataBucket, Key: CATALOG_KEY }).promise()
      .catch((err: AWSError) => err.code !== 'NoSuchKey'
        ? Promise.reject(err)
        : Promise.resolve({ /* no data */ } as S3.GetObjectOutput));

    if (!catalogFile.Body) {
      return false;
    }

    const catalog = JSON.parse(catalogFile.Body.toString('utf-8'));
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

    const version = (await shellOut('npm', 'view', packageName, 'version')).stdout;
    const time = JSON.parse((await shellOut('npm', 'view', packageName, 'time', '--json')).stdout);

    // yeah, the 'time` view returns published time for ALL versions, regardless of the request.
    const publishedAt = new Date(time[version]);

    console.log(`Package: ${packageName} | Version : ${version} | Published At: ${publishedAt}`);

    return { version, publishedAt };
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


void handler({});