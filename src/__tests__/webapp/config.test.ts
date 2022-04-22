import { readJsonSync } from 'fs-extra';
import { TagCondition } from '../../package-tag';
import { PackageTagGroup } from '../../package-tag-group';
import { Category } from '../../webapp';
import { FeedConfig, WebappConfig } from '../../webapp/config';

const DEFAULT_CONFIG = {
  featuredPackages: {
    sections: [
      {
        name: 'Recently updated',
        showLastUpdated: 10,
      },
    ],
  },
  packageLinks: [],
  packageStats: true,
  packageTags: [],
  packageTagGroups: [],
  debugInfo: {
    constructHubVersion: expect.any(String),
    constructHubWebappVersion: expect.any(String),
  },
};

test('minimal', () => {
  // GIVEN
  const config = new WebappConfig({});

  // THEN
  const file = readJsonSync(config.file.path);
  expect(file).toEqual(DEFAULT_CONFIG);
});

test('package links', () => {
  // GIVEN
  const config = new WebappConfig({
    packageLinks: [
      {
        linkLabel: 'Service Level Agreement',
        configKey: 'SLA',
      },
      {
        linkLabel: 'Contact',
        configKey: 'Contact',
        linkText: 'Email Me!',
        allowedDomains: ['me.com'],
      },
    ],
  });

  // THEN
  const file = readJsonSync(config.file.path);
  expect(file).toEqual({
    ...DEFAULT_CONFIG,
    packageLinks: [
      {
        linkLabel: 'Service Level Agreement',
        configKey: 'SLA',
      },
      {
        linkLabel: 'Contact',
        configKey: 'Contact',
        linkText: 'Email Me!',
      },
    ],
  });
});

describe('package tags', () => {
  test('keyword', () => {
    // GIVEN
    const id = 'ID';
    const keyword = {
      label: 'Official',
      color: '#00FF00',
    };
    const config = new WebappConfig({
      packageTags: [
        {
          id,
          keyword,
          condition: TagCondition.or(
            TagCondition.field('name').eq('construct-hub'),
            TagCondition.field('name').eq('construct-hub-webapp'),
          ).bind(),
        },
      ],
    });

    // THEN
    const file = readJsonSync(config.file.path);
    expect(file).toEqual({
      ...DEFAULT_CONFIG,
      packageTags: [
        {
          id,
          keyword,
        },
      ],
    });
  });

  test('tag groups', () => {
    // GIVEN
    const groups = [
      new PackageTagGroup('foo', { label: 'Foo', tooltip: 'Lorem ipsum' }),
      new PackageTagGroup('bar'),
    ];

    const config = new WebappConfig({ packageTagGroups: groups });

    // THEN
    const file = readJsonSync(config.file.path);
    expect(file).toEqual({
      ...DEFAULT_CONFIG,
      packageTagGroups: groups.map(group => group.bind()),
    });
  });

  test('highlight', () => {
    // GIVEN
    const id = 'ID';
    const highlight = {
      label: 'Official',
      color: '#00FF00',
      icon: 'ICONPATH',
    };
    const config = new WebappConfig({
      packageTags: [
        {
          id,
          highlight,
          condition: TagCondition.or(
            TagCondition.field('name').eq('construct-hub'),
            TagCondition.field('name').eq('construct-hub-webapp'),
          ).bind(),
        },
      ],
    });

    // THEN
    const file = readJsonSync(config.file.path);
    expect(file).toEqual({
      ...DEFAULT_CONFIG,
      packageTags: [
        {
          id,
          highlight,
        },
      ],
    });
  });

  test('search filter', () => {
    // GIVEN
    const id = 'ID';
    const searchFilter = {
      groupBy: 'FILTERNAME',
      display: 'DISPLAY',
    };
    const config = new WebappConfig({
      packageTags: [
        {
          id,
          searchFilter,
          condition: TagCondition.or(
            TagCondition.field('name').eq('construct-hub'),
            TagCondition.field('name').eq('construct-hub-webapp'),
          ).bind(),
        },
      ],
    });

    // THEN
    const file = readJsonSync(config.file.path);
    expect(file).toEqual({
      ...DEFAULT_CONFIG,
      packageTags: [
        {
          id,
          searchFilter,
        },
      ],
    });
  });

  test('search filter group', () => {
    // GIVEN
    const group = new PackageTagGroup('TAG_GROUP', { label: 'LABEL' });
    const searchFilter = {
      group,
      display: 'DISPLAY',
    };

    const config = new WebappConfig({
      packageTags: [
        {
          id: 'ID',
          searchFilter,
          condition: TagCondition.field('name').eq('construct-hub').bind(),
        },
      ],
      packageTagGroups: [group],
    });

    // THEN
    const file = readJsonSync(config.file.path);
    expect(file).toEqual({
      ...DEFAULT_CONFIG,
      packageTagGroups: [{ id: group.id, label: group.label, filterType: group.filterType }],
      packageTags: [{
        id: 'ID',
        searchFilter: {
          groupBy: group.id,
          display: 'DISPLAY',
        },
      }],
    });
  });
});

test('featured packages', () => {
  // GIVEN
  const featuredPackages = {
    sections: [
      {
        name: 'Recently updated',
        showLastUpdated: 4,
      },
      {
        name: 'From the AWS CDK',
        showPackages: [
          {
            name: '@aws-cdk/core',
          },
          {
            name: '@aws-cdk/aws-s3',
            comment: 'One of the most popular AWS CDK libraries!',
          },
          {
            name: '@aws-cdk/aws-lambda',
          },
          {
            name: '@aws-cdk/pipelines',
            comment: 'The pipelines L3 construct library abstracts away many of the details of managing software deployment within AWS.',
          },
        ],
      },
    ],
  };

  // WHEN
  const config = new WebappConfig({ featuredPackages });

  // THEN
  const file = readJsonSync(config.file.path);
  expect(file).toEqual({
    ...DEFAULT_CONFIG,
    featuredPackages,
  });
});

test('feature flags', () => {
  // GIVEN
  const featureFlags = {
    homeRedesign: true,
    searchRedesign: true,
  };

  // WHEN
  const config = new WebappConfig({ featureFlags });

  // THEN
  const file = readJsonSync(config.file.path);
  expect(file).toEqual({
    ...DEFAULT_CONFIG,
    featureFlags,
  });
});

test('categories', () => {
  // GIVEN
  const categories: Category[] = [
    { title: 'Monitoring', url: '/search?q=monitoring' },
    { title: 'Kubernetes', url: '/search?keywords=k8s' },
  ];

  // WHEN
  const config = new WebappConfig({ categories });

  // THEN
  const file = readJsonSync(config.file.path);
  expect(file).toEqual({
    ...DEFAULT_CONFIG,
    categories,
  });
});

test('feed', () => {
  // GIVEN
  const feedConfig: FeedConfig[] = [
    {
      mimeType: 'application/atom+xml',
      url: '/atom',
    },
    {
      mimeType: 'application/atom+xml',
      url: '/rss',
    },
  ];

  // WHEN
  const config = new WebappConfig({
    feedConfig,
  });

  // THEN
  const file = readJsonSync(config.file.path);
  expect(file).toEqual({
    ...DEFAULT_CONFIG,
    feeds: feedConfig,
  });
});