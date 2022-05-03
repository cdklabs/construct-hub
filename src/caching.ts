import { CacheControl } from '@aws-cdk/aws-s3-deployment';
import { Duration } from '@aws-cdk/core';

/**
 * Caching policies for serving data for the Construct Hub web app.
 */
export class CacheStrategy {
  /**
   * Default caching policy for all S3 objects.
   */
  public static default() {
    return new CacheStrategy([
      CacheControl.setPublic(),
      CacheControl.maxAge(Duration.minutes(5)),
      CacheControl.mustRevalidate(),
      CacheControl.sMaxAge(Duration.minutes(1)),
      CacheControl.proxyRevalidate(),
    ]);
  }

  private constructor(private readonly cacheControl: CacheControl[]) {}

  public toString() {
    return this.cacheControl.map((c) => c.value).join(', ');
  }

  public toArray() {
    return this.cacheControl;
  }
}
