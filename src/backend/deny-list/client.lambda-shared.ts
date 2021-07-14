import * as AWS from 'aws-sdk';
import { requireEnv } from '../shared/env.lambda-shared';
import { DenyListMap, DenyListRule, DENY_LIST_BUCKET_NAME_ENV, DENY_LIST_OBJECT_KEY_ENV } from './api';

/**
 * Options for `DenyListClient`.
 */
export interface DenyListClientOptions {
  /**
   * The name of the S3 bucket where the deny list is stored.
   * @default process.env.DENY_LIST_BUCKET
   */
  readonly bucketName?: string;

  /**
   * The object key where the deny list is stored.
   * @default process.env.DENY_LIST_OBJECT_KEY
   */
  readonly objectKey?: string;
}

/**
 * A client for working with the deny list.
 */
export class DenyListClient {
  private readonly s3: AWS.S3;
  private readonly bucketName: string;
  private readonly objectKey: string;

  private map: DenyListMap | undefined;

  constructor(options: DenyListClientOptions = {}) {
    this.bucketName = options.bucketName ?? requireEnv(DENY_LIST_BUCKET_NAME_ENV);
    this.objectKey = options.objectKey ?? requireEnv(DENY_LIST_OBJECT_KEY_ENV);
    this.s3 = new AWS.S3();
  }

  /**
   * Downloads the deny list and stores it in memory.
   *
   * This must be called before `lookup()`.
   */
  public async init() {
    this.map = {}; // reset

    try {
      const params = {
        Bucket: this.bucketName,
        Key: this.objectKey,
      };

      const response = await this.s3.getObject(params).promise();
      const body = response.Body;

      if (!body) {
        console.log(`WARNING: deny list body is empty at ${this.bucketName}/${this.objectKey}`);
        return;
      }

      const data = JSON.parse(body.toString()) as DenyListMap;
      if (typeof(data) != 'object') {
        console.log(`ERROR: Invalid format in deny list file at ${this.bucketName}/${this.objectKey}. Expecting a map`);
        return;
      }

      this.map = data;
    } catch (e) {
      console.log(`Error pasing deny list file ${this.bucketName}/${this.objectKey}: ${e}`);
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
    if (!this.map) {
      throw new Error('DenyListClient must be initialized before calling isDenied');
    }

    let entry = this.map[name];
    if (!entry) {
      entry = this.map[`${name}@${version}`];
    }

    return entry;
  }
}
