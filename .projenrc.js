const { AwsCdkConstructLibrary } = require('projen');

const project = new AwsCdkConstructLibrary({
  jsiiFqn: 'projen.AwsCdkConstructLibrary',

  name: 'construct-hub',
  description: 'A construct library that model Construct Hub instances.',
  keywords: ['aws', 'aws-cdk', 'constructs', 'construct-hub'],
  license: 'Apache-2.0',
  stability: 'experimental',

  repositoryUrl: 'https://github.com/cdklabs/construct-hub.git',
  homepage: 'https://github.com/cdklabs',
  defaultReleaseBranch: 'main',
  mergify: false,
  dependabot: false,

  author: 'Amazon Web Services, Inc.',
  authorAddress: 'aws-cdk-team@amazon.com',
  authorOrganization: true,

  cdkVersion: '1.101.0',
  cdkDependencies: [
    '@aws-cdk/core',
    '@aws-cdk/cx-api',
    '@aws-cdk/aws-cloudwatch',
    '@aws-cdk/aws-certificatemanager',
    '@aws-cdk/aws-route53',
    '@aws-cdk/aws-sns',
  ],

  devDeps: [
    'yaml',
  ],

  pullRequestTemplateContents: [
    '',
    '----',
    '',
    '*By submitting this pull request, I confirm that my contribution is made under the terms of the Apache-2.0 license*',
  ],

  releaseToNpm: true,
  npmRegistryUrl: 'https://npm.pkg.github.com/',
  npmTokenSecret: 'GITHUB_TOKEN',
});

project.synth();
