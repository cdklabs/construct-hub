import * as s3 from '@aws-cdk/aws-s3';
import { Construct } from '@aws-cdk/core';
import { HomeConfig } from './home-config';

/**
 * Manages all "live" configuration options for the website.
 *
 * Creates a bucket whose objects should be configured by the user.
 */
export class LiveConfig extends Construct {
  /**
   * The S3 bucket in which live configuration is stored.
   */
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
    });

    new HomeConfig(this, 'HomeConfig', {
      bucket: this.bucket,
    });
  }
}
