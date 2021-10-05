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
  ): Promise<NpmDownloadsOutput> {
    if (packages.length > NpmDownloadsClient.MAX_PACKAGES_PER_QUERY) {
      throw new Error(`Too many packages were provided (max: ${NpmDownloadsClient.MAX_PACKAGES_PER_QUERY})`);
    }
    if (packages.length === 0) return {};

    const result = await this.got(`${NpmDownloadsClient.NPM_DOWNLOADS_API_URL}/${period}/${packages.join(',')}`, {
      timeout: 30 * 1000, // 30 seconds
    });

    const data = JSON.parse(result.body);
    if ('error' in data) {
      throw new Error(`Could not retrieve download metrics: ${data.error}`);
    }
    for (const key of Object.keys(data)) {
      if (!data[key]) {
        throw new Error(`Could not retrieve download metrics for package ${key}`);
      }
    }

    if (packages[0] in data) {
      // multiple packages were returned
      return data;
    } else {
      // only a single package was returned
      return {
        [packages[0]]: data,
      };
    }
  }

  /**
   * Retrieves the number of downloads each package has on npm in the latest period.
   * Output is not guaranteed to be returned in a specific order.
   * Throws an error if any packages have no metrics.
   */
  async getDownloads(
    packages: string[],
    options: NpmDownloadsOptions = {},
  ): Promise<NpmDownloadsOutput> {
    const period = options.period ?? NpmDownloadsPeriod.LAST_WEEK;

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
      Object.assign(output, await this.getDownloadsRaw([pkg], period));
    }
    for (let i = 0; i < unscopedPackages.length; i += NpmDownloadsClient.MAX_PACKAGES_PER_QUERY) {
      const batch = unscopedPackages.slice(i, i + NpmDownloadsClient.MAX_PACKAGES_PER_QUERY);
      Object.assign(output, await this.getDownloadsRaw(batch, period));
    }

    return output;
  }

  private isScopedPackage(packageName: string) {
    return packageName.indexOf('/') !== -1;
  }
}
