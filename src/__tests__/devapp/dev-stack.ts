import { Construct, Stack } from '@aws-cdk/core';
import { ConstructHub } from '../..';

export class DevStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
      },
    });

    new ConstructHub(this, 'ConstructHub');
  }
}
