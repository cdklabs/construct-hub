import * as AWS from 'aws-sdk';
import { CatalogModel, PackageInfo } from '.';
import { s3 } from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';

export interface ICatalogClient {
  readonly packages: readonly PackageInfo[];
}

export class CatalogNotFoundError extends Error {
  constructor(key: string) {
    super(`No catalog was found at ${key}`);
  }
}

/**
 * A client for working with the catalog.
 */
export class CatalogClient implements ICatalogClient {
  /**
   * Creates a new client for accessing the catalog.
   */
  public static async newClient(): Promise<ICatalogClient> {
    const client = new CatalogClient();
    await client.init();
    return client;
  }

  private readonly s3: AWS.S3;
  private readonly bucketName: string;
  private readonly objectKey: string;

  private _packages: PackageInfo[] | undefined;

  private constructor() {
    this.bucketName = requireEnv('CATALOG_BUCKET_NAME');
    this.objectKey = requireEnv('CATALOG_OBJECT_KEY');
    this.s3 = s3();
  }

  /**
   * Downloads the catalog object and stores it in memory.
   */
  private async init() {
    if (this._packages) {
      throw new Error('init() cannot be called twice');
    }

    this._packages = [];

    const params = {
      Bucket: this.bucketName,
      Key: this.objectKey,
    };

    let body: AWS.S3.Body | undefined;
    try {
      const data = await this.s3.getObject(params).promise();
      body = data.Body;
    } catch (e) {
      throw new CatalogNotFoundError(`${this.bucketName}/${this.objectKey}`);
    }

    if (!body) {
      throw new Error(
        `Catalog body is empty at ${this.bucketName}/${this.objectKey}`
      );
    }

    const contents = body.toString('utf-8');

    try {
      const data = JSON.parse(contents) as CatalogModel;
      if (typeof data != 'object') {
        throw new Error('Invalid format in catalog file. Expecting a map');
      }
      this._packages = data.packages;
    } catch (e) {
      throw new Error(
        `Unable to parse catalog file ${this.bucketName}/${this.objectKey}: ${e}`
      );
    }
  }

  /**
   * Returns a copy of the catalog list.
   */
  public get packages() {
    if (!this._packages) {
      throw new Error('CatalogClient must be initialized');
    }

    return [...this._packages];
  }
}
