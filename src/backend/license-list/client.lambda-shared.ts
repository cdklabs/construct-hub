import { EnvironmentVariables } from './constants';
import { s3 } from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';

/**
 * A client for working with the license list.
 */
export class LicenseListClient {
  public static async newClient() {
    const client = new LicenseListClient();
    await client.init();
    return client;
  }

  readonly #bucketName: string;
  readonly #objectKey: string;

  #map?: Map<string, string>;

  private constructor() {
    this.#bucketName = requireEnv(EnvironmentVariables.BUCKET_NAME);
    this.#objectKey = requireEnv(EnvironmentVariables.OBJECT_KEY);
  }

  /**
   * Looks up a license ID in this list.
   *
   * @param licenseId the license ID to look up (possibly with unorthodox case).
   *
   * @returns the normalized SPDX license identifier for this license, if it is
   *          in the list, or `undefined` otherwise.
   */
  public lookup(licenseId: string): string | undefined {
    /* istanbul ignore if (should never happen) */
    if (this.#map == null) {
      throw new Error('LicenseListClient must be initialized');
    }
    return this.#map.get(licenseId.toUpperCase());
  }

  private async init() {
    /* istanbul ignore if (should never happen) */
    if (this.#map != null) {
      throw new Error('init() cannot be called twice');
    }
    const { Body: body } = await s3()
      .getObject({ Bucket: this.#bucketName, Key: this.#objectKey })
      .promise();
    if (!body) {
      console.log(
        `WARNING: license list is empty at ${this.#bucketName}/${
          this.#objectKey
        }`
      );
      this.#map = new Map();
      return;
    }

    const licenseIds = JSON.parse(body.toString('utf-8'));
    if (!Array.isArray(licenseIds)) {
      throw new Error(
        `Invalid format in license list file at ${this.#bucketName}/${
          this.#objectKey
        }. Expected an array.`
      );
    }
    this.#map = new Map(licenseIds.map((id) => [id.toUpperCase(), id]));
  }
}
