import * as process from 'process';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Construct, Stack } from '@aws-cdk/core';
import { ConstructHub } from '../..';
import { TagCondition } from '../../package-tag';

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

    const isAwsOfficial = TagCondition.field('name').startsWith('@aws-cdk/');
    const isCdk8sOfficial = TagCondition.field('name').eq('cdk8s');
    const isHashicoprOfficial = TagCondition.field('name').eq('cdktf');
    const isCommunity = TagCondition.not(TagCondition.or(isAwsOfficial, isCdk8sOfficial, isHashicoprOfficial));
    const authorSearchFilter = {
      name: 'Author',
    };

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
      isolateSensitiveTasks,
      logRetention: RetentionDays.ONE_WEEK,
      packageTags: [{
        id: 'aws-official',
        condition: isAwsOfficial,
        highlight: {
          label: 'AWS Official',
          color: '#ED3B00',
          icon: '/assets/construct.png',
        },
        searchFilter: authorSearchFilter,
      }, {
        id: 'cdk8s-official',
        condition: isCdk8sOfficial,
        highlight: {
          label: 'CDK8s Official',
          color: '#ED3B00',
          icon: '/assets/construct.png',
        },
        searchFilter: authorSearchFilter,
      }, {
        id: 'tf-official',
        condition: isHashicoprOfficial,
        highlight: {
          label: 'Hashicorp Official',
          color: '#ED3B00',
          icon: '/assets/construct.png',
        },
        searchFilter: authorSearchFilter,
      }, {
        id: 'community',
        condition: isCommunity,
        highlight: {
          label: 'Community',
          color: '#2F50FE',
          icon: '/assets/community.png',
        },
        searchFilter: authorSearchFilter,
      }],
    });
  }
}
