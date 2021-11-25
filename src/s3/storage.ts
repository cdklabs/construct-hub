import * as s3 from '@aws-cdk/aws-s3';
import { CfnOutput, Construct, Stack, Tags } from '@aws-cdk/core';

/**
 * Properties for `S3StorageFactory`
 */
export interface S3StorageFactoryProps {
  /**
   * When enabled, the factory will return the failover buckets instead of the primary.
   *
   * @default false
   */
  readonly failover?: boolean;
}

/**
 * Create s3 storage resources.
 */
export class S3StorageFactory extends Construct {

  /**
   * Retrieve or create the storage factory for the current scope.
   *
   * This is stack singleton.
   */
  public static getOrCreate(scope: Construct, props: S3StorageFactoryProps = {}): S3StorageFactory {
    const stack = Stack.of(scope);
    const factory = stack.node.tryFindChild(S3StorageFactory.UID);
    if (!factory) {
      return new S3StorageFactory(stack, S3StorageFactory.UID, props);
    }
    return stack.node.findChild(S3StorageFactory.UID) as S3StorageFactory;
  }

  private static readonly UID = 'S3StorageFactory';

  private failoverActive: boolean;

  private constructor(scope: Construct, id: string, props: S3StorageFactoryProps = {}) {
    super(scope, id);
    this.failoverActive = props.failover ?? false;
  };

  /**
   * Create a new bucket in a storage config aware manner.
   *
   * @returns s3.Bucket
   */
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