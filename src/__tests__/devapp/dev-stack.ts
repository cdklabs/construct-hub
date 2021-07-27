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

    new ConstructHub(this, 'ConstructHub', {
      denyList: [
        { package: '@aws-cdk/cdk', reason: 'This package has been deprecated in favor of @aws-cdk/core' },
        { package: 'cdk-foo-bar', reason: 'Dummy package' },
        { package: 'cdk-lambda-subminute', version: '0.1.31', reason: 'test' },
        { package: 'cdk-ecr-image-scan-notify', version: '0.0.192', reason: 'test number 2' },
      ],
      backendDashboardName: 'construct-hub-backend',
    });
  }
}
