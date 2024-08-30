// This file MUST NOT import anything from aws-cdk-lib
// If you do, it will cause aws-cdk-lib to be bundled into the lambda handlers.
// Bundling aws-cdk-lib, will make them 30mb+ of size,
// and could potentially break the handler due to importing dodgy transitive dependencies.
// Yes this has happened before.

/**
 * Caching policies for serving data for the Construct Hub web app.
 */
export class CacheStrategy {
  /**
   * Default caching policy for all S3 objects.
   */
  public static default() {
    return new CacheStrategy([
      'public',
      'max-age=300',
      'must-revalidate',
      's-maxage=60',
      'proxy-revalidate',
    ]);
  }

  private constructor(private readonly cacheControl: string[]) {}

  public toString(): string {
    return this.cacheControl.join(', ');
  }

  public toArray(): string[] {
    return this.cacheControl;
  }
}
