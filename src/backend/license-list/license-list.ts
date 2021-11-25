import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import { Construct } from '@aws-cdk/core';
import { S3StorageFactory } from '../../s3/storage';
import { SpdxLicense } from '../../spdx-license';
import { ILicenseList } from './api';
import { EnvironmentVariables } from './constants';

export interface LicenseListProps {
  /**
   * All SPDX licenses to be included in the list.
   */
  readonly licenses: SpdxLicense[];
}

/**
 * A list of licenses, which can be used to control filter packages before
 * indexing.
 */
export class LicenseList extends Construct implements ILicenseList {
  /**
   * The S3 bucket in which the license list is stored.
   */
  public readonly bucket: s3.IBucket;

  /**
   * The object key in which the license list is stored.
   */
  public readonly objectKey = 'allowed-licenses.json';

  private readonly upload: s3deploy.BucketDeployment;

  public constructor(scope: Construct, id: string, props: LicenseListProps) {
    super(scope, id);

    const storageFactory = S3StorageFactory.getOrCreate(this);
    this.bucket = storageFactory.newBucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
    });

    this.upload = new s3deploy.BucketDeployment(this, 'Resource', {
      destinationBucket: this.bucket,
      prune: true,
      retainOnDelete: true,
      sources: [this.createAsset(props.licenses)],
    });
  }

  /**
   * Grants an AWS Lambda function permissions to read the license allow list,
   * and adds the relevant environment variables expected by the
   * `LicenseListClient`.
   */
  public grantRead(handler: lambda.Function) {
    handler.addEnvironment(EnvironmentVariables.BUCKET_NAME, this.bucket.bucketName);
    handler.addEnvironment(EnvironmentVariables.OBJECT_KEY, this.objectKey);
    this.bucket.grantRead(handler);
    // The handler now depends on the deny-list having been uploaded
    handler.node.addDependency(this.upload);
  }

  private createAsset(licenses: readonly SpdxLicense[]) {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'license-list-'));
    fs.writeFileSync(
      path.join(tmpdir, this.objectKey),
      JSON.stringify(licenses.map((l) => l.id), null, 2),
      'utf-8',
    );
    return s3deploy.Source.asset(tmpdir);
  }
}
