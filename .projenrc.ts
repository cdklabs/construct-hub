import { join, relative } from 'path';
import { CdklabsConstructLibrary } from 'cdklabs-projen-project-types';
import { github } from 'projen';
import { addDevApp } from './projenrc/dev-app';
import { discoverIntegrationTests } from './projenrc/integ-tests';
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
  name: 'construct-hub',
  projenrcTs: true,
  description: 'A construct library that models Construct Hub instances.',
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
    '',
    '----',
    '',
    '*By submitting this pull request, I confirm that my contribution is made under the terms of the Apache-2.0 license*',
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

addVpcAllowListManagement(project);
addDevApp(project);

project.addDevDeps('glob');
discoverLambdas(project);
discoverEcsTasks(project);
discoverIntegrationTests(project);

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
