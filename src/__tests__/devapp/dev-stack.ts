import * as process from 'process';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Construct, Stack } from '@aws-cdk/core';
import { ConstructHub } from '../..';

export interface DevStackProps {
  /**
   * Whether lambda functions should be isolated or not.
   *
   * @default !!process.env.ISOLATED_MODE
   */
  readonly isolateSensitiveTasks?: boolean;
}

export class DevStack extends Stack {
  constructor(scope: Construct, id: string, { isolateSensitiveTasks = !!process.env.ISOLATED_MODE }: DevStackProps = {}) {
    super(scope, id, {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
      },
    });

    new ConstructHub(this, 'ConstructHub', {
      denyList: [
        { packageName: '@aws-cdk/cdk', reason: 'This package has been deprecated in favor of @aws-cdk/core' },
        { packageName: 'cdk-foo-bar', reason: 'Dummy package' },
        { packageName: 'cdk-lambda-subminute', version: '0.1.31', reason: 'test' },
        { packageName: 'cdk-ecr-image-scan-notify', version: '0.0.192', reason: 'test number 2' },
      ],
      backendDashboardName: 'construct-hub-backend',
      isolateSensitiveTasks,
      logRetention: RetentionDays.ONE_WEEK,
    });
  }
}
