import * as process from 'process';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Construct, Stack } from '@aws-cdk/core';
import { ConstructHub, Isolation } from '../..';
import { TagCondition, TagGroupConfig } from '../../package-tag';

/**
 * Defines a packageTagGroup to group author tags.
 * packageTags which reference this id in the searchFilter.groupBy property
 * will be displayed under this group
 */
const authorSearchFilter: TagGroupConfig = {
  id: 'author',
  label: 'Author',
  tooltip: 'Filter your search results to a specific author',
  filterType: 'radio',
};

const isAwsPublished = TagCondition.field('name').startsWith('@aws-cdk/');
const isCommunity = TagCondition.not(isAwsPublished);

const makeAuthorTag = (display: string, condition: TagCondition) => ({
  id: `${display.toLowerCase()}-published`,
  condition,
  searchFilter: {
    groupBy: authorSearchFilter.id,
    display,
  },
  highlight: {
    label: display,
    color: '#2F855A',
    icon: '/assets/checkmark.svg',
  },
});

/**
 * Defines a packageTagGroup to group use case tags.
 * This group will default to a checkbox filter b/c filterType is not specified
 */
const useCaseSearchFilter: TagGroupConfig = {
  id: 'use-case',
  label: 'Use Case',
  tooltip: 'Find results for your specific use case',
};

const serverlessUseCase = TagCondition.field('keywords').includes('serverless');
const containersUseCase = TagCondition.field('keywords').includes('containers');
const k8sUseCase = TagCondition.field('keywords').includes('k8s');

const makeUseCaseTag = (label: string, useCase: TagCondition) => ({
  id: `uc-${label}`,
  condition: useCase,
  searchFilter: {
    groupBy: useCaseSearchFilter.id,
    display: label,
  },
});

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

    const sensitiveTaskIsolation =
      props.sensitiveTaskIsolation ?? defaultIsolateSensitiveTasks();

    new ConstructHub(this, 'ConstructHub', {
      featureFlags: {
        homeRedesign: true,
        searchRedesign: true,
      },
      denyList: [
        {
          packageName: '@aws-cdk/cdk',
          reason: 'This package has been deprecated in favor of @aws-cdk/core',
        },
        { packageName: 'cdk-foo-bar', reason: 'Dummy package' },
        {
          packageName: 'cdk-lambda-subminute',
          version: '0.1.31',
          reason: 'test',
        },
        {
          packageName: 'cdk-ecr-image-scan-notify',
          version: '0.0.192',
          reason: 'test number 2',
        },
      ],
      backendDashboardName: 'construct-hub-backend',
      sensitiveTaskIsolation,
      logRetention: RetentionDays.ONE_WEEK,
      packageTags: [
        makeAuthorTag('AWS', isAwsPublished),
        makeAuthorTag('Community', isCommunity),
        makeUseCaseTag('Serverless', serverlessUseCase),
        makeUseCaseTag('Containers', containersUseCase),
        makeUseCaseTag('K8s', k8sUseCase),
      ],
      packageTagGroups: [authorSearchFilter, useCaseSearchFilter],
      categories: [
        { title: 'Category1', url: '/search?q=cat1' },
        { title: 'Category2', url: '/search?keywords=boom' },
      ],
    });
  }
}

/**
 * The default isolation is driven by the `ISOLATED_MODE` environment variable
 * so that developers can easily use the `DevStack` construct to deploy a
 * personal development stack with the desired isolation level.
 *
 * The default isolation mode is set according to the following table:
 *
 *  | ${ISOLATED_MODE} | Default `Isolation` setting         |
 *  |------------------|-------------------------------------|
 *  | not set          | Isolation.UNLIMITED_INTERNET_ACCESS |
 *  | `LIMITED`        | Isolation.LIMITED_INTERNET_ACCESS   |
 *  | any other value  | Isolation.NO_INTERNET_ACCESS        |
 */
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
