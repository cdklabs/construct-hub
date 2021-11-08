import * as process from 'process';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Construct, Stack } from '@aws-cdk/core';
import { ConstructHub, Isolation } from '../..';
import { TagCondition } from '../../package-tag';

export interface DevStackProps {
  /**
   * How should sensitive processes be isolated.
   *
   * @default - if process.env.ISOLATED_MODE is not set,
   *            `Isolation.UNLIMITED_INTERNET_ACCESS`. If it is set to `LIMITED`
   *            (case is ignored), `Isolation.LIMITED_INTERNET_ACCESS`.
   *            Otherwise, `Isolation.NO_INTERNET_ACCESS`
   */
  readonly sensitiveTaskIsolation?: Isolation;
}

export class DevStack extends Stack {
  constructor(scope: Construct, id: string, props: DevStackProps = {}) {
    super(scope, id, {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
      },
    });

    const isAwsOfficial = TagCondition.field('name').startsWith('@aws-cdk/');
    const authorSearchFilter = 'Author';

    const sensitiveTaskIsolation = props.sensitiveTaskIsolation ?? defaultIsolateSensitiveTasks();

    new ConstructHub(this, 'ConstructHub', {
      featureFlags: {
        homeRedesign: true,
        searchRedesign: true,
      },
      denyList: [
        { packageName: '@aws-cdk/cdk', reason: 'This package has been deprecated in favor of @aws-cdk/core' },
        { packageName: 'cdk-foo-bar', reason: 'Dummy package' },
        { packageName: 'cdk-lambda-subminute', version: '0.1.31', reason: 'test' },
        { packageName: 'cdk-ecr-image-scan-notify', version: '0.0.192', reason: 'test number 2' },
      ],
      backendDashboardName: 'construct-hub-backend',
      sensitiveTaskIsolation,
      logRetention: RetentionDays.ONE_WEEK,
      packageTags: [{
        id: 'aws-official',
        condition: isAwsOfficial,
        highlight: {
          label: 'AWS Official',
          color: '#ED3B00',
          icon: '/assets/construct.png',
        },
        searchFilter: {
          groupBy: authorSearchFilter,
          display: 'AWS',
        },
      }],
    });
  }
}

function defaultIsolateSensitiveTasks() {
  switch (process.env.ISOLATED_MODE?.toUpperCase()) {
    case undefined:
      return Isolation.UNLIMITED_INTERNET_ACCESS;
    case 'LIMITED':
      return Isolation.LIMITED_INTERNET_ACCESS;
    default:
      return Isolation.NO_INTERNET_ACCESS;
  }
}
