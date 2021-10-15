import { IFunction, Tracing } from '@aws-cdk/aws-lambda';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { IBucket } from '@aws-cdk/aws-s3';
import { Construct, Duration } from '@aws-cdk/core';
import type { AssemblyTargets } from '@jsii/spec';

import { Monitoring } from '../../monitoring';
import { DenyList } from '../deny-list';
import { CatalogBuilder as Handler } from './catalog-builder';

/**
 * Props for `CatalogBuilder`.
 */
export interface CatalogBuilderProps {
  /**
   * The package store bucket.
   */
  readonly bucket: IBucket;

  /**
   * The monitoring handler to register alarms with.
   */
  readonly monitoring: Monitoring;

  /**
   * How long should execution logs be retained?
   *
   * @default RetentionDays.TEN_YEARS
   */
  readonly logRetention?: RetentionDays;

  /**
   * The deny list construct.
   */
  readonly denyList: DenyList;
}

/**
 * Builds or re-builds the `catalog.json` object in the designated bucket.
 */
export class CatalogBuilder extends Construct {
  public readonly function: IFunction;

  public constructor(scope: Construct, id: string, props: CatalogBuilderProps) {
    super(scope, id);

    const handler = new Handler(this, 'Default', {
      description: `Creates the catalog.json object in ${props.bucket.bucketName}`,
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        AWS_EMF_ENVIRONMENT: 'Local',
      },
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 10_240, // Currently the maximum possible setting
      reservedConcurrentExecutions: 1,
      timeout: Duration.minutes(15),
      tracing: Tracing.PASS_THROUGH,
    });
    this.function = handler;

    // allow the catalog builder to use the client.
    props.denyList.grantRead(handler);

    props.bucket.grantReadWrite(this.function);
  }
}

/**
 * Data format for catalog object.
 */
export interface CatalogModel {
  /**
   * Packages in the catalog.
   */
  readonly packages: PackageInfo[];
  /**
   * Date the catalog was last updated, in ISO 8601 format.
   */
  readonly updated: string;
}

/**
 * Data format for packages stored in the catalog.
 */
export interface PackageInfo {
  /**
   * The name of the assembly.
   */
  readonly name: string;

  /**
   * The major version of this assembly, according to SemVer.
   */
  readonly major: number;

  /**
   * The complete SemVer version string for this package's major version stream,
   * including pre-release identifiers, but excluding additional metadata
   * (everything starting at `+`, if there is any).
   */
  readonly version: string;

  /**
   * The SPDX license identifier for the package's license.
   */
  readonly license: string;

  /**
   * The list of keywords configured on the package.
   */
  readonly keywords: readonly string[];

  /**
   * Metadata assigned by the discovery function to the latest release of this
   * package's major version stream, if any.
   */
  readonly metadata?: { readonly [key: string]: string };

  /**
   * The author of the package.
   */
  readonly author: {
    readonly name: string;
    readonly email?: string;
    readonly url?: string;
  };

  /**
   * The list of languages configured on the package, and the corresponding
   * configuration.
   */
  readonly languages: AssemblyTargets;

  /**
   * The timestamp at which this version was created.
   */
  readonly time: Date;

  /**
   * The description of the package.
   */
  readonly description?: string;
}

