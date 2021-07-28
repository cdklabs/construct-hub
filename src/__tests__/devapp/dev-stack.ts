import * as process from 'process';
import * as sns from '@aws-cdk/aws-sns';
import { Construct, Stack } from '@aws-cdk/core';
import { ConstructHub } from '../..';

export interface DevStackProps {
  /**
   * Whether lambda functions should be isolated or not.
   *
   * @default !!process.env.ISOLATE_LAMBDAS
   */
  readonly isolateLambdas?: boolean;
}

export class DevStack extends Stack {
  constructor(scope: Construct, id: string, { isolateLambdas = !!process.env.ISOLATE_LAMBDAS }: DevStackProps = {}) {
    super(scope, id, {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
      },
    });

    const topic = new sns.Topic(this, 'Topic');

    new ConstructHub(this, 'ConstructHub', {
      alarmActions: {
        normalSeverity: topic.topicArn,
        highSeverity: topic.topicArn,
      },
      backendDashboardName: 'construct-hub-backend',
      isolateLambdas,
    });
  }
}
