import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { CatalogModel, PackageInfo } from '.';
import { S3_CLIENT } from '../shared/aws.lambda-shared';
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

  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly objectKey: string;

  private _packages: PackageInfo[] | undefined;

  private constructor() {
    this.bucketName = requireEnv('CATALOG_BUCKET_NAME');
    this.objectKey = requireEnv('CATALOG_OBJECT_KEY');
    this.s3Client = S3_CLIENT;
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

    let contents: string | undefined;
    try {
      const res = await this.s3Client.send(new GetObjectCommand(params));
      contents = await res.Body?.transformToString('utf-8');
    } catch (e) {
      throw new CatalogNotFoundError(`${this.bucketName}/${this.objectKey}`);
    }

    if (!contents) {
      throw new Error(
        `Catalog body is empty at ${this.bucketName}/${this.objectKey}`
      );
    }

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
