import { readJsonSync } from 'fs-extra';
import { TagCondition } from '../../package-tag';
import { WebappConfig } from '../../webapp/config';

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
};

test('minimal', () => {
  // GIVEN
  const config = new WebappConfig({});

  // THEN
  const file = readJsonSync(config.path);
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
  const file = readJsonSync(config.path);
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

test('package tags', () => {
  // GIVEN
  const config = new WebappConfig({
    packageTags: [
      {
        label: 'Official',
        color: '#00FF00',
        condition: TagCondition.or(
          TagCondition.field('name').eq('construct-hub'),
          TagCondition.field('name').eq('construct-hub-webapp'),
        ).bind(),
      },
    ],
  });

  // THEN
  const file = readJsonSync(config.path);
  expect(file).toEqual({
    ...DEFAULT_CONFIG,
    packageTags: [
      {
        color: '#00FF00',
        label: 'Official',
      },
    ],
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
  const file = readJsonSync(config.path);
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
  const file = readJsonSync(config.path);
  expect(file).toEqual({
    ...DEFAULT_CONFIG,
    featureFlags,
  });
});
