import type { Got } from 'got/dist/source/types';

export enum NpmDownloadsPeriod {
  /**
   * Gets downloads for the last available day. In practice, this will usually
   * be "yesterday" (in GMT) but if stats for that day have not yet landed, it
   * will be the day before.
   */
  LAST_DAY = 'last-day',

  /**
   * Gets downloads for the last 7 available days.
   */
  LAST_WEEK = 'last-week',

  /**
   * Gets downloads for the last 30 available days.
   */
  LAST_MONTH = 'last-month'
}

export interface NpmDownloadsEntry {
  readonly downloads: number;
  readonly start: string;
  readonly end: string;
  readonly package: string;
}

export type NpmDownloadsOutput = { [key: string]: NpmDownloadsEntry };

export interface NpmDownloadsOptions {
  /**
   * The period to query for package download counts.
   * @default NpmDownloadsPeriod.LAST_WEEK
   */
  readonly period?: NpmDownloadsPeriod;

  /**
   * Throw an error when any package's download metrics are not available.
   * @default true
   */
  readonly throwErrors?: boolean;
}

export class NpmDownloadsClient {
  public static readonly NPM_DOWNLOADS_API_URL = 'https://api.npmjs.org/downloads/point';
  public static readonly MAX_PACKAGES_PER_QUERY = 128; // this is a limitation from npm's API! do not change

  private readonly got: Got;

  constructor(gotService: Got) {
    this.got = gotService;
  }

  private async getDownloadsRaw(
    packages: string[],
    period: NpmDownloadsPeriod,
    throwErrors: boolean,
  ): Promise<NpmDownloadsOutput> {
    if (packages.length > NpmDownloadsClient.MAX_PACKAGES_PER_QUERY) {
      throw new Error(`Too many packages were provided (max: ${NpmDownloadsClient.MAX_PACKAGES_PER_QUERY})`);
    }
    if (packages.length === 0) return {};

    console.log(`Querying NPM for packages: [${packages.join(',')}]...`);
    const result = await this.got(`${NpmDownloadsClient.NPM_DOWNLOADS_API_URL}/${period}/${packages.join(',')}`, {
      timeout: 5 * 1000, // 30 seconds
    }).catch((err) => {
      if (throwErrors) {
        throw err;
      } else {
        return { body: JSON.stringify({ error: JSON.stringify(err) }) };
      }
    });

    const data = JSON.parse(result.body);

    // single package query error
    if ('error' in data) {
      if (throwErrors) {
        throw new Error(`Could not retrieve download metrics: ${data.error}`);
      } else {
        console.error(`Could not retrieve download metrics: ${data.error}`);
        return {};
      }
    }
    // bulk package query error
    for (const key of Object.keys(data)) {
      if (!data[key]) {
        if (throwErrors) {
          throw new Error(`Could not retrieve download metrics for package ${key}`);
        } else {
          console.error(`Could not retrieve download metrics for package ${key}`);
          delete data[key];
        }
      }
    }

    if (packages[0] in data) {
      // multiple packages were returned
      return data;
    } else {
      // only a single package was returned
      return { [packages[0]]: data };
    }
  }

  /**
   * Retrieves the number of downloads each package has on npm in the latest period.
   * Output is not guaranteed to be returned in a specific order.
   * If throwErrors option is specified, an error is thrown when a package's
   * download count is unavailable - otherwise, it's just omitted from
   * the output.
   */
  async getDownloads(
    packages: string[],
    options: NpmDownloadsOptions = {},
  ): Promise<NpmDownloadsOutput> {
    const period = options.period ?? NpmDownloadsPeriod.LAST_WEEK;
    const throwErrors = options.throwErrors ?? true;

    // separate scoped and unscoped packages since scoped packages are not
    // supported by the bulk query API
    const scopedPackages = [];
    const unscopedPackages = [];
    for (const pkg of packages) {
      if (this.isScopedPackage(pkg)) {
        scopedPackages.push(pkg);
      } else {
        unscopedPackages.push(pkg);
      }
    }

    // we could parallelize this, but then it's more likely we get throttled
    const output: NpmDownloadsOutput = {};
    for (const pkg of scopedPackages) {
      Object.assign(output, await this.getDownloadsRaw([pkg], period, throwErrors));
    }
    for (let i = 0; i < unscopedPackages.length; i += NpmDownloadsClient.MAX_PACKAGES_PER_QUERY) {
      const batch = unscopedPackages.slice(i, i + NpmDownloadsClient.MAX_PACKAGES_PER_QUERY);
      Object.assign(output, await this.getDownloadsRaw(batch, period, throwErrors));
    }

    return output;
  }

  private isScopedPackage(packageName: string) {
    return packageName.indexOf('/') !== -1;
  }
}
