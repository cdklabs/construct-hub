import { join, relative } from 'path';
import { CdklabsConstructLibrary } from 'cdklabs-projen-project-types';
import { github } from 'projen';
import { addDevApp } from './projenrc/dev-app';
// import { discoverIntegrationTests } from './projenrc/integ-tests';
import { discoverEcsTasks } from './projenrc/magic-ecs';
import { discoverLambdas } from './projenrc/magic-lambda';
import { generateSpdxLicenseEnum } from './projenrc/spdx-licenses';
import { addVpcAllowListManagement } from './projenrc/vps-allow-list';

const peerDeps = [
  '@aws-cdk/aws-servicecatalogappregistry-alpha@2.84.0-alpha.0',
  'aws-cdk-lib@^2.84.0',
  'cdk-watchful',
  'constructs',
];

const cdkCli = 'aws-cdk@^2';

const project = new CdklabsConstructLibrary({
  cdkVersion: '2.84.0',
  setNodeEngineVersion: false,
  private: false,
  name: '@gd-constructs/construct-hub',
  projenrcTs: true,
  description:
    'A forked version of AWS construct library that models Construct Hub instances.',
  keywords: ['aws', 'aws-cdk', 'constructs', 'construct-hub'],
  license: 'Apache-2.0',
  stability: 'experimental',

  repositoryUrl: 'https://github.com/cdklabs/construct-hub.git',
  homepage: 'https://github.com/cdklabs',
  defaultReleaseBranch: 'main',

  author: 'Amazon Web Services, Inc.',
  authorAddress: 'construct-ecosystem-team@amazon.com',
  authorOrganization: true,

  devDeps: [
    ...peerDeps,
    '@jsii/spec',
    '@types/fs-extra',
    '@types/semver',
    '@types/streamx',
    '@types/tar-stream',
    '@types/tough-cookie',
    '@types/uuid',
    cdkCli,
    'aws-embedded-metrics',
    'dotenv',
    'async-sema',
    'aws-sdk-mock',
    'aws-sdk',
    'aws-xray-sdk-core',
    'case',
    'cdk-dia',
    'esbuild',
    'feed',
    'fs-extra',
    'got',
    'JSONStream',
    'semver',
    'spdx-license-list',
    'streamx',
    'streamcount',
    'tar-stream',
    'uuid',
    'yaml',
    'nock',
    'normalize-registry-metadata',
    '@octokit/rest',
    'markdown-it',
    'markdown-it-emoji',
    'changelog-filename-regex',
    '@types/markdown-it',
    '@types/markdown-it-emoji',
    '@types/changelog-filename-regex',
  ],

  peerDeps,

  minNodeVersion: '16.16.0',
  jsiiVersion: '5.1.x',

  pullRequestTemplateContents: [
    '<!--\n' +
      'Thanks for submitting a PR to this repository.  To ensure that we get quality PRs which are easy to review, please fill out the template to the best of your ability.  Add additional information if you feel the template does not give a complete picture of the work.\n' +
      '\n' +
      'Any line with an 🚨 on it should be completely replaced with your own words, removing the 🚨 and example text.  If you feel that one of these lines is unnecessary, please write N/A instead.\n' +
      '\n' +
      'Please structure the title of your PR formally as:\n' +
      '[FEATURE] - Description of your feature\n' +
      "[UPDATE] - Description of the updates you've made\n" +
      '[BUG] - Description of your bug fix\n' +
      '[DOCS] - Description of your doc changes\n' +
      '[MAINT] - Description of the maintenance to the repo\n' +
      '-->\n' +
      '\n' +
      "## What's Changed\n" +
      '\n' +
      '<!--\n' +
      "Please include a one or two line summary of what's contained in the PR.  You'll get the chance to fill in more detail later.\n" +
      '-->\n' +
      '\n' +
      '🚨 This PR changes X to Y 🚨\n' +
      '\n' +
      '### This change contains:\n' +
      '\n' +
      '- [ ] New Features\n' +
      '- [ ] Improvements\n' +
      '- [ ] Bug Fixes\n' +
      '- [ ] Documentation changes\n' +
      '- [ ] Repository maintenance\n' +
      '\n' +
      '### Within this PR I have:\n' +
      '\n' +
      '- [ ] Updated relevant documentation\n' +
      '- [ ] Updated tests\n' +
      '- [ ] Adequately described the PR in this document\n' +
      '\n' +
      '### Scope of Change\n' +
      '\n' +
      '<!--\n' +
      'We follow [semver](https://semver.org) for versioning.  Please familiarize yourself with this system and consider the scope of your changes.  Then check the corresponding box below.\n' +
      '-->\n' +
      '\n' +
      '- [ ] Breaking Change (Major release bump)\n' +
      '- [ ] New, backwards compatible feature (Minor release bump)\n' +
      '- [ ] Backwards compatible bugfix, update, or change, which does not impact the public api (Patch release bump)\n' +
      '- [ ] No version change required (doc update, repo maintenance, etc...)\n' +
      '\n' +
      '#### Breaking Changes\n' +
      '\n' +
      '<!--\n' +
      'If there are any breaking changes please describe them in detail here, otherwise just put N/A\n' +
      '-->\n' +
      '\n' +
      '🚨 This PR introduces a breaking change to... which can be addressed by ... 🚨\n' +
      '\n' +
      '### Details\n' +
      '\n' +
      '<!--\n' +
      'Please provide details about what was changed.  Feel free to be descriptive here and dig in.\n' +
      '-->\n' +
      '\n' +
      '🚨 This PR changes XXX so that YYY is now the case. It does so by doing ZZZ and that impacts AAA... 🚨\n' +
      '\n' +
      '### Motivation\n' +
      '\n' +
      '<!--\n' +
      'It is critically important for a present and future review of this work to understand driving motivation.\n' +
      '-->\n' +
      '\n' +
      '🚨 This work was necessary because... 🚨\n' +
      '\n' +
      '## Related Issues/Stories/PRs/etc...\n' +
      '\n' +
      '<!--\n' +
      'GitHub does a great job of auto resolving/closing related issues if you use syntax like:\n' +
      '  resolves #123\n' +
      'If this resolves multiple issues, please add a full "resolves" line for each\n' +
      "You can also link to JIRA stories if that's helpful.\n" +
      '-->\n' +
      '\n' +
      'resolves: <issue number>\n' +
      '\n' +
      '## Notes for Reviewers\n' +
      '\n' +
      '<!--\n' +
      'Please provide any other comments/notes/etc... that may be valuable to a reviewer.\n' +
      'Try to make their life as easy as possible.  Assume they need context to give you a quality review.\n' +
      '\n' +
      "If you think it's helpful, please add comments to your code to call out the items discussed here.\n" +
      '-->\n' +
      '\n' +
      '🚨 As a reviewer, you should know... 🚨\n',
  ],

  enablePRAutoMerge: true,

  releaseToNpm: true,
  cdklabsPublishingDefaults: false,

  publishToGo: undefined,
  // publishToGo: {
  //  moduleName: 'github.com/cdklabs/construct-hub-go',
  //},

  publishToMaven: undefined,
  // see https://github.com/cdklabs/construct-hub/issues/60
  // publishToMaven: {
  //   javaPackage: 'software.amazon.constructhub',
  //   mavenArtifactId: 'software.amazon.constructhub',
  //   mavenGroupId: 'construct-hub',
  //   mavenEndpoint: 'https://aws.oss.sonatype.org',
  // },

  publishToNuget: undefined,
  //publishToNuget: {
  //  dotNetNamespace: 'Construct.Hub',
  //  packageId: 'Construct.Hub',
  //},

  publishToPypi: undefined,
  // https://github.com/cdklabs/construct-hub/issues/775
  // publishToPypi: {
  //   distName: 'construct-hub',
  //   module: 'construct_hub',
  // },

  // run tests from .js -- otherwise lambda bundlers get confused
  testdir: 'src/__tests__',

  // Exclude handler images from TypeScript compiler path
  excludeTypescript: ['resources/**'],

  autoApproveOptions: {
    allowedUsernames: ['cdklabs-automation'],
    secret: 'GITHUB_TOKEN',
  },
  autoApproveUpgrades: true,

  depsUpgradeOptions: {
    exclude: [...peerDeps, cdkCli],
    workflowOptions: {
      labels: ['auto-approve'],
      projenCredentials: github.GithubCredentials.fromPersonalAccessToken({
        secret: 'PROJEN_GITHUB_TOKEN',
      }),
    },
  },

  jestOptions: {
    jestConfig: {
      // Ensure we don't try to parallelize too much, this causes timeouts.
      maxConcurrency: 2,
      moduleNameMapper: {
        '../package.json': '<rootDir>/__mocks__/package.json',
      },
    },
  },
  prettier: true,
  prettierOptions: {
    settings: {
      singleQuote: true,
    },
  },

  // disable some features in favor of custom implementation
  // in future, we should migrate the custom code to use the provided feature
  lambdaAutoDiscover: false,
  integrationTestAutoDiscover: false,
});

project.tasks.addEnvironment('NODE_OPTIONS', '--max-old-space-size=4096');

// create component diagram
project.setScript(
  'dia',
  'yarn dev:synth && cd lib/__tests__/devapp && npx cdk-dia && mv diagram.png ../../../diagrams/diagram.png'
);

project.addGitIgnore('!/test/fixtures/tests/package.tgz');
project.addGitIgnore('/test/integ.transliterator.ecstask.ts.snapshot/asset.*');
project.addGitIgnore('!/src/third-party-types/*');

project.package.addField('resolutions', {
  // https://github.com/aws/aws-cdk/issues/20319
  '@types/prettier': '2.6.0',

  // copying this from construct-hub-webapp https://cs.github.com/cdklabs/construct-hub-webapp/blob/bbe2e9ad73ce9b5ddee1b618667fb123274e5635/.projenrc.js#L96
  'nth-check': '2.0.1',

  // Potential solution to a types problem, got it from https://github.com/DefinitelyTyped/DefinitelyTyped/discussions/62277
  '@types/express-serve-static-core': '4.17.6',

  // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/64924
  '@types/lodash': '4.14.192',

  // octokit messed something up with its dependencies, causing incompatible types
  // try removing this once @octokit/rest v20 is released
  '@octokit/plugin-rest-endpoint-methods': '7.1.2',
});

project.addTask('bundle', {
  description: 'Bundle all lambda and ECS functions',
});

// I have to put this here, otherwise projen overrides this with a `jsii-docgen`
// dependency without a version. I don't know where or why.
project.addDevDeps('jsii-docgen@^10.2.0');

// extract the "build/" directory from "construct-hub-webapp" into "./website"
// and bundle it with this library. this way, we are only taking a
// dev-dependency on the webapp instead of a normal/bundled dependency.
project.addDevDeps('construct-hub-webapp');

project.compileTask.prependExec(
  'cp -r ./node_modules/construct-hub-webapp/build ./website'
);
project.compileTask.prependExec('rm -rf ./website');
project.npmignore?.addPatterns('!/website'); // <-- include in tarball
project.gitignore.addPatterns('/website'); // <-- don't commit

project.gitignore.exclude('.vscode/');
project.gitignore.exclude('**/.DS_Store');
project.gitignore.exclude('.idea/');

addVpcAllowListManagement(project);
addDevApp(project);

project.addDevDeps('glob');
discoverLambdas(project);
discoverEcsTasks(project);

// Disabling integration tests for now, as it's not working as expected.
// discoverIntegrationTests(project);

// see https://github.com/aws/jsii/issues/3311
const bundleWorkerPool = [
  'ts-node',
  relative(__dirname, join('projenrc', 'bundle-javascript-for-ecs.exec.ts')),
  'node_modules/jsii-rosetta/lib/translate_all_worker.js',
  `lib/backend/transliterator/transliterator.ecs-entrypoint.bundle/translate_all_worker.js`,
].join(' ');
project.tasks.tryFind('bundle:transliterator')?.exec(bundleWorkerPool);
project.tasks
  .tryFind('bundle:transliterator:watch')
  ?.prependExec(bundleWorkerPool);

generateSpdxLicenseEnum(project);

// Escape hatch to fix "JavaScript heap out of memory" in GitHub Actions
const buildWorkflow = project.tryFindObjectFile('.github/workflows/build.yml');
buildWorkflow?.addOverride(
  'jobs.build.steps.3.env.NODE_OPTIONS',
  '--max-old-space-size=8192' // 8GB
);

project.synth();
