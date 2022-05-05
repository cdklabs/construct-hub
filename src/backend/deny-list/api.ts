import type { Function } from 'aws-cdk-lib/aws-lambda';

/**
 * An entry in the list of packages blocked from display in the construct hub.
 */
export interface DenyListRule {
  /**
   * The name of the package to block (npm).
   */
  readonly packageName: string;

  /**
   * The package version to block (must be a valid version such as "1.0.3").
   *
   * @default - all versions of this package are blocked.
   */
  readonly version?: string;

  /**
   * The reason why this package/version is denied. This information will be
   * emitted to the construct hub logs.
   */
  readonly reason: string;
}

/**
 * The contents of the deny list file in S3.
 */
export interface DenyListMap {
  /**
   * A map from "name@version" to deny list rule.
   */
  readonly [key: string]: DenyListRule;
}

/**
 * DenyList features exposed to extension points.
 */
export interface IDenyList {
  /**
   * Grants an AWS Lambda function permissions to read the deny list, and adds
   * the relevant environment variables expected by the `DenyListClient`.
   */
  grantRead(handler: Function): void;
}
