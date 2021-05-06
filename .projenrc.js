const { readdirSync, statSync, existsSync } = require('fs');
const { join } = require('path');
const { AwsCdkConstructLibrary, SourceCode, FileBase, JsonFile } = require('projen');

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

  cdkVersion: '1.100.0',
  //cdkVersionPinning: true,

  cdkDependencies: [
    '@aws-cdk/core',
    '@aws-cdk/cx-api',
    '@aws-cdk/aws-cloudfront',
    '@aws-cdk/aws-cloudfront-origins',
    '@aws-cdk/aws-cloudwatch',
    '@aws-cdk/aws-certificatemanager',
    '@aws-cdk/aws-route53',
    '@aws-cdk/aws-lambda-nodejs',
    '@aws-cdk/aws-lambda',
    '@aws-cdk/aws-s3',
    '@aws-cdk/aws-s3-deployment',
    '@aws-cdk/aws-sns',
  ],

  devDeps: [
    'yaml',
    'esbuild',
  ],

  deps: ['cdk-watchful@^0.5.129'],

  peerDeps: [
    // for some reason, JSII does not allow specifying this as a normal dep, even though we don't have public APIs that use any types from it
    'cdk-watchful@^0.5.129',
  ],

  bundledDeps: [
    'construct-hub-webapp',
  ],

  minNodeVersion: '12.0.0',

  pullRequestTemplateContents: [
    '',
    '----',
    '',
    '*By submitting this pull request, I confirm that my contribution is made under the terms of the Apache-2.0 license*',
  ],

  releaseToNpm: true,
  npmRegistryUrl: 'https://npm.pkg.github.com/',
  npmTokenSecret: 'GITHUB_TOKEN',

  projenUpgradeSecret: 'CDK_AUTOMATION_GITHUB_TOKEN',

  // run tests from .js -- otherwise lambda bundlers get confused
  testdir: 'src/__tests__',
});

function addDevApp() {
  // add "dev:xxx" tasks for interacting with the dev stack
  const devapp = 'lib/__tests__/devapp';
  const commands = ['synth', 'diff', 'deploy'];
  for (const cmd of commands) {
    project.addTask(`dev:${cmd}`, {
      description: `cdk ${cmd}`,
      cwd: devapp,
      exec: `npx cdk ${cmd}`,
    });
  }

  project.gitignore.addPatterns(`${devapp}/cdk.out`);
  project.addDevDeps(`aws-cdk@${project.cdkVersion}`);

  new JsonFile(project, `${devapp}/cdk.json`, {
    obj: {
      app: 'node main.js',
      context: {
        '@aws-cdk/core:newStyleStackSynthesis': true,
        '@aws-cdk/aws-apigateway:usagePlanKeyOrderInsensitiveId': true,
        '@aws-cdk/core:enableStackNameDuplicates': 'true',
        'aws-cdk:enableDiffNoFail': 'true',
        '@aws-cdk/core:stackRelativeExports': 'true',
        '@aws-cdk/aws-ecr-assets:dockerIgnoreSupport': true,
        '@aws-cdk/aws-secretsmanager:parseOwnedSecretName': true,
        '@aws-cdk/aws-kms:defaultKeyPolicies': true,
        '@aws-cdk/aws-s3:grantWriteWithoutAcl': true,
        '@aws-cdk/aws-ecs-patterns:removeDefaultDesiredCount': true,
        '@aws-cdk/aws-rds:lowercaseDbIdentifier': true,
        '@aws-cdk/aws-efs:defaultEncryptionAtRest': true,
      },
    },
  });
}

addDevApp();

project.synth();
