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

  cdkVersion: '2.0.0-alpha.13',
  cdkDependencies: ['aws-cdk-lib'],

  devDeps: ['constructs@^10.0.5', 'yaml'],

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

const yarnUpgrade = project.github.addWorkflow('yarn-upgrade');
yarnUpgrade.on({
  // Run every wednesday at 13:37 UTC
  schedule: [{ cron: '37 13 * * 3' }],
  // Can be manually triggered
  workflow_dispatch: {},
});
yarnUpgrade.addJobs({
  upgrade: {
    'name': 'Yarn Upgrade',
    'runs-on': 'ubuntu-latest',
    'steps': [],
  },
});


project.synth();
