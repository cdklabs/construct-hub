import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DenyListMap, DenyListRule } from './api';
import {
  ENV_DENY_LIST_BUCKET_NAME,
  ENV_DENY_LIST_OBJECT_KEY,
} from './constants';
import { s3Client } from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';

/**
 * A client for working with the deny list.
 */
export class DenyListClient {
  /**
   * Creates a new client for accessing the deny list.
   */
  public static async newClient() {
    const client = new DenyListClient();
    await client.init();
    return client;
  }

  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly objectKey: string;

  private _map: DenyListMap | undefined;

  private constructor() {
    this.bucketName = requireEnv(ENV_DENY_LIST_BUCKET_NAME);
    this.objectKey = requireEnv(ENV_DENY_LIST_OBJECT_KEY);
    this.s3Client = s3Client;
  }

  /**
   * Downloads the deny list and stores it in memory.
   *
   * This must be called before `lookup()`.
   */
  private async init() {
    if (this._map) {
      throw new Error('init() cannot be called twice');
    }

    this._map = {};

    try {
      const params = {
        Bucket: this.bucketName,
        Key: this.objectKey,
      };

      const { Body: body } = await this.s3Client.send(
        new GetObjectCommand(params)
      );

      if (!body) {
        console.log(
          `WARNING: deny list body is empty at ${this.bucketName}/${this.objectKey}`
        );
        return;
      }

      const contents = await body.transformToString();

      // an empty string is a valid (empty) deny list
      if (contents.length === 0) {
        return;
      }

      const data = JSON.parse(contents) as DenyListMap;
      if (typeof data != 'object') {
        throw new Error(
          `Invalid format in deny list file at ${this.bucketName}/${this.objectKey}. Expecting a map`
        );
      }

      this._map = data;
    } catch (e: any) {
      if (e.code === 'NoSuchKey' || e.code === 'NoSuchBucket') {
        return;
      }

      throw new Error(
        `Unable to parse deny list file ${this.bucketName}/${this.objectKey}: ${e}`
      );
    }
  }

  /**
   * Checks if a package (name + version) is in the deny list.
   * @param name The name of the package
   * @param version The package version
   * @returns `undefined` if the package is not in the deny list or a
   * `DenyListRule` otherwise.
   */
  public lookup(name: string, version: string): DenyListRule | undefined {
    if (!this._map) {
      throw new Error('DenyListClient must be initialized');
    }

    return this._map[name] ?? this._map[`${name}/v${version}`];
  }

  /**
   * Returns a copy of the deny list map.
   */
  public get map() {
    if (!this._map) {
      throw new Error('DenyListClient must be initialized');
    }

    return this._map;
  }
}
