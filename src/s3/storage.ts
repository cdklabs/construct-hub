import * as s3 from '@aws-cdk/aws-s3';
import { CfnOutput, Construct, Tags } from '@aws-cdk/core';

/**
 * Properties for `S3StorageFactory`
 */
export interface S3StorageFactoryProps {
  readonly failoverActive?: boolean;
}

/**
 * Create s3 storage resources.
 */
export class S3StorageFactory {

  private failoverActive: boolean;

  constructor(props: S3StorageFactoryProps = {}) {
    this.failoverActive = props.failoverActive ?? false;
  };

  public newBucket(scope: Construct, id: string, props?: s3.BucketProps): s3.Bucket {

    function failoverFor(bucket: s3.Bucket): s3.Bucket {
      const _failover = new s3.Bucket(scope, `Failover${id}`, props);
      Tags.of(_failover).add('failover', 'true');

      new CfnOutput(scope, 'SnapshotCommand', {
        description: `Snapshot ${bucket.node.path}`,
        value: `aws s3 sync s3://${bucket.bucketName} s3://${_failover.bucketName}`,
      });
      return _failover;
    }

    const primary = new s3.Bucket(scope, id, props);

    // note that we create the failover bucket even if we don't currently use it.
    // this is because conditioning bucket creation will eventually fail since buckets
    // are normally retained.
    const failover = failoverFor(primary);

    return this.failoverActive ? failover : primary;
  }

}