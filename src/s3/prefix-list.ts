import { Stack } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
  AwsCustomResource,
  AwsSdkCall,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

/**
 * This obtains the PrefixLisId for the AWS-Managed prefix list of the S3
 * service in the stack's current region.
 */
export class S3PrefixList extends Construct {
  /**
   * The ID of the AWS-managed Prefix List for AWS S3 in the current region.
   */
  public readonly prefixListId: string;

  /**
   * The name of the AWS-managed Prefix List for AWS S3 in the current region.
   */
  public readonly prefixListName: string;

  public constructor(scope: Construct, id: string) {
    super(scope, id);

    const describePrefixLists: AwsSdkCall = {
      action: 'describePrefixLists',
      service: 'EC2',
      parameters: {
        Filters: [
          {
            Name: 'prefix-list-name',
            Values: [`com.amazonaws.${Stack.of(this).region}.s3`],
          },
        ],
      },
      outputPaths: [
        'PrefixLists.0.PrefixListId',
        'PrefixLists.0.PrefixListName',
      ],
      physicalResourceId: PhysicalResourceId.fromResponse(
        'PrefixLists.0.PrefixListId'
      ),
    };

    const resource = new AwsCustomResource(this, 'Resource', {
      onCreate: describePrefixLists,
      onUpdate: describePrefixLists,
      // The ec2:DescribePrefixList action does not support resource scoping (understandably)
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      logRetention: RetentionDays.THREE_MONTHS,
      resourceType: 'Custom::S3-PrefixList',
    });

    this.prefixListId = resource.getResponseField('PrefixLists.0.PrefixListId');
    this.prefixListName = resource.getResponseField(
      'PrefixLists.0.PrefixListName'
    );
  }
}
