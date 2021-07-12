import { GatewayVpcEndpoint } from '@aws-cdk/aws-ec2';
import { AnyPrincipal, Effect, Grant, IGrantable, PolicyStatement } from '@aws-cdk/aws-iam';
import { IBucket } from '@aws-cdk/aws-s3';

/**
 * Decorates an S3 Bucket so that grants are made including a VPC endpoint
 * policy.
 *
 * This currently only supports the `gratRead` and `grantWrite` APIs.
 *
 * @param bucket      the bucket to be wrapped.
 * @param vpcEndpoint the VPC Endpoint for S3 to be used.
 *
 * @returns a decorated S3 Bucket.
 */
export function throughVpcEndpoint(bucket: IBucket, vpcEndpoint: GatewayVpcEndpoint): IBucket {
  return new Proxy(bucket, {
    get(target, property, _receiver) {
      switch (property) {
        case 'grantRead':
          return decoratedGrantRead.bind(target);
        case 'grantWrite':
          return decoratedGrantWrite.bind(target);
        default:
          if (typeof property === 'string' && /^grant([A-Z]|$)/.test(property)) {
            console.warn(`No VPC Endpoint policy grants will be added for ${property} on ${bucket.node.path}`);
          }
          return (target as any)[property];
      }
    },
    getOwnPropertyDescriptor(target, property) {
      const realDescriptor = Object.getOwnPropertyDescriptor(target, property);
      switch (property) {
        case 'grantRead':
          return {
            ...realDescriptor,
            value: decoratedGrantRead,
            get: undefined,
            set: undefined,
          };
        case 'grantWrite':
          return {
            ...realDescriptor,
            value: decoratedGrantWrite,
            get: undefined,
            set: undefined,
          };
        default:
          if (typeof property === 'string' && /^grant([A-Z]|$)/.test(property)) {
            console.warn(`No VPC Endpoint policy grants will be added for ${property} on ${bucket.node.path}`);
          }
          return realDescriptor;
      }
    }
  });

  function decoratedGrantRead(this: IBucket, identity: IGrantable, objectsKeyPattern: any = '*'): Grant {
    const mainGrant = this.grantRead(identity, objectsKeyPattern);
    if (mainGrant.success) {
      vpcEndpoint.addToPolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetObject*', 's3:GetBucket*', 's3:List*'],
        resources: [this.bucketArn, this.arnForObjects(objectsKeyPattern)],
        // Gateway endpoints have this pecular quirk about them that the
        // `principals` are compared strictly using *EXACT MATCH*, meaning you
        // cannot restrict to a particular role, as the actual principal will be
        // an STS assumed-role principal, which cannot be fully predicted. So we
        // would have used a condition to enact this limitation... But
        // unfortunately the `IGrantable` API does not allow us to access the
        // principal ARN for the grantee, so we just skip that... The principal
        // policy will have been configured to limit access already anyway!
        principals: [new AnyPrincipal()],
      }));
    }
    return mainGrant;
  }

  function decoratedGrantWrite(this: IBucket, identity: IGrantable, objectsKeyPattern: any = '*'): Grant {
    const mainGrant = this.grantWrite(identity, objectsKeyPattern);
    if (mainGrant.success) {
      vpcEndpoint.addToPolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:Abort*', 's3:DeleteObject*', 's3:PutObject*'],
        resources: [this.bucketArn, this.arnForObjects(objectsKeyPattern)],
        // Gateway endpoints have this pecular quirk about them that the
        // `principals` are compared strictly using *EXACT MATCH*, meaning you
        // cannot restrict to a particular role, as the actual principal will be
        // an STS assumed-role principal, which cannot be fully predicted. So we
        // would have used a condition to enact this limitation... But
        // unfortunately the `IGrantable` API does not allow us to access the
        // principal ARN for the grantee, so we just skip that... The principal
        // policy will have been configured to limit access already anyway!
        principals: [new AnyPrincipal()],
      }));
    }
    return mainGrant;
  }
}
