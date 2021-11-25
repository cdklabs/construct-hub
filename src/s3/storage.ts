import { Bucket, BucketProps } from '@aws-cdk/aws-s3';
import { Construct } from '@aws-cdk/core';

export interface S3StorageFactoryProps {

  readonly failoverEnabled?: boolean;

  readonly failoverActive?: boolean;
}

export class S3StorageFactory {

  private failoverEnabled: boolean;
  private failoverActive: boolean;

  constructor(props: S3StorageFactoryProps = {}) {

    this.failoverEnabled = props.failoverEnabled ?? false;
    this.failoverActive = props.failoverActive ?? false;

    if (this.failoverActive && !this.failoverEnabled) {
      throw new Error('Unable to activate failover buckets since failover is not enabled');
    }

  };

  public newBucket(scope: Construct, id: string, props?: BucketProps): Bucket {

    const primary = new Bucket(scope, id, props);
    const failover = this.failoverEnabled ? new Bucket(scope, `${id}Failover`, props) : undefined;

    if (!this.failoverActive) {
      return primary;
    }

    // shouldn't happen, constructor validation prevents it
    if (!failover) {
      throw new Error(`Unable to activate failover bucket for primary ${primary.node.path} since failover is not enabled`);
    }

    return failover;
  }

}