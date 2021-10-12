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

export type NpmDownloadsOutput = Map<string, NpmDownloadsEntry>;

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
    packages: readonly string[],
    period: NpmDownloadsPeriod,
    throwErrors: boolean,
  ): Promise<NpmDownloadsOutput> {
    if (packages.length > NpmDownloadsClient.MAX_PACKAGES_PER_QUERY) {
      throw new Error(`Too many packages were provided (max: ${NpmDownloadsClient.MAX_PACKAGES_PER_QUERY})`);
    }
    if (packages.some((pkg) => this.isScopedPackage(pkg)) && packages.length > 1) {
      throw new Error('Scoped packages aren\'t supported by the bulk query API.');
    }
    if (packages.length === 0) return new Map();

    console.log(`Querying NPM for ${packages.length} package(s): [${packages.join(', ')}]`);
    const result = await this.got(`${NpmDownloadsClient.NPM_DOWNLOADS_API_URL}/${period}/${packages.join(',')}`, {
      timeout: 5 * 1000, // 5 seconds
    }).catch((err) => {
      if (throwErrors) {
        throw err;
      } else {
        return { body: JSON.stringify({ error: JSON.stringify(err) }) };
      }
    });

    const data: NpmApiResult = JSON.parse(result.body);

    // single package query error
    // ex. { "error": "package foo not found" }
    if ('error' in data) {
      if (throwErrors) {
        throw new Error(`Could not retrieve download metrics: ${data.error}`);
      } else {
        console.error(`Could not retrieve download metrics: ${data.error}`);
        return new Map();
      }
    }

    // only a single package was returned
    if (isSingleDownloadsEntry(data)) {
      return new Map([[packages[0], data]]);
    }

    // bulk query result
    for (const key of Object.keys(data)) {
      if (data[key] === null) {
        if (throwErrors) {
          throw new Error(`Could not retrieve download metrics for package ${key}`);
        } else {
          console.error(`Could not retrieve download metrics for package ${key}`);
          delete data[key];
        }
      }
    }

    // typescript can't figure out that we removed all null values
    // @ts-ignore
    return new Map(Object.entries(data));
  }

  /**
   * Retrieves the number of downloads each package has on npm in the latest period.
   * Output is not guaranteed to be returned in a specific order.
   * If throwErrors option is specified, an error is thrown when a package's
   * download count is unavailable - otherwise, it's just omitted from
   * the output.
   */
  public async getDownloads(
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
    const output: NpmDownloadsOutput = new Map();
    for (const pkg of scopedPackages) {
      const partialResults = await this.getDownloadsRaw([pkg], period, throwErrors);
      for (const [key, value] of partialResults) {
        output.set(key, value);
      }
    }
    for (let i = 0; i < unscopedPackages.length; i += NpmDownloadsClient.MAX_PACKAGES_PER_QUERY) {
      const batch = unscopedPackages.slice(i, i + NpmDownloadsClient.MAX_PACKAGES_PER_QUERY);
      const partialResults = await this.getDownloadsRaw(batch, period, throwErrors);
      for (const [key, value] of partialResults) {
        output.set(key, value);
      }
    }

    return output;
  }

  private isScopedPackage(packageName: string) {
    return packageName.startsWith('@');
  }
}

// Types for the output of NPM's API.
type NpmApiResult = NpmApiError | NpmApiSingleResult | NpmApiMultipleResult;
type NpmApiError = { error: string };
type NpmApiSingleResult = NpmDownloadsEntry;
type NpmApiMultipleResult = { [key: string]: NpmApiSingleResult | null };

function isSingleDownloadsEntry(data: any): data is NpmDownloadsEntry {
  return 'downloads' in data && typeof data.downloads === 'number';
}
