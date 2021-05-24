const { basename, join, dirname, relative } = require('path');
const glob = require('glob');
const { pascalCase } = require('pascal-case');
const { AwsCdkConstructLibrary, SourceCode, FileBase, JsonFile } = require('projen');

const project = new AwsCdkConstructLibrary({
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
  authorAddress: 'construct-ecosystem-team@amazon.com',
  authorOrganization: true,

  cdkVersion: '1.100.0',

  cdkDependencies: [
    '@aws-cdk/core',
    '@aws-cdk/cx-api',
    '@aws-cdk/aws-cloudfront',
    '@aws-cdk/aws-cloudfront-origins',
    '@aws-cdk/aws-cloudwatch',
    '@aws-cdk/aws-cloudwatch-actions',
    '@aws-cdk/aws-events',
    '@aws-cdk/aws-events-targets',
    '@aws-cdk/aws-certificatemanager',
    '@aws-cdk/aws-route53',
    '@aws-cdk/aws-route53-targets',
    '@aws-cdk/aws-lambda',
    '@aws-cdk/aws-s3',
    '@aws-cdk/aws-s3-deployment',
    '@aws-cdk/aws-sns',
  ],

  devDeps: [
    'yaml',
    'esbuild',
    'got',
  ],

  deps: [
    'cdk-watchful@0.5.141',
  ],

  peerDeps: [
    // for some reason, JSII does not allow specifying this as a normal dep, even though we don't have public APIs that use any types from it
    'cdk-watchful@0.5.141',
  ],

  minNodeVersion: '12.0.0',

  pullRequestTemplateContents: [
    '',
    '----',
    '',
    '*By submitting this pull request, I confirm that my contribution is made under the terms of the Apache-2.0 license*',
  ],

  projenUpgradeSecret: 'CDK_AUTOMATION_GITHUB_TOKEN',

  releaseToNpm: true,

  //publishToGo: {
  //  moduleName: 'github.com/cdklabs/construct-hub-go',
  //},
  publishToMaven: {
    javaPackage: 'software.amazon.constructhub',
    mavenArtifactId: 'software.amazon.constructhub',
    mavenGroupId: 'construct-hub',
    mavenEndpoint: 'https://aws.oss.sonatype.org',
  },
  //publishToNuget: {
  //  dotNetNamespace: 'Construct.Hub',
  //  packageId: 'Construct.Hub',
  //},
  publishToPypi: {
    distName: 'construct-hub',
    module: 'construct_hub',
  },

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

const bundleTask = project.addTask('bundle', { description: 'Bundle all lambda functions' });

/**
 * Generates a construct for a pre-bundled AWS Lambda function:
 *
 * This function will:
 * 1. Add a compile task that uses `esbuild` to create a bundle from them under
 *    `lib/.../xxx.bundle/index.js`
 * 2. Generate TypeScript code under `src/.../xxx.ts` with a construct that
 *    extends `lambda.Function` which points to the bundled asset.

 * @param entrypoint the location of a file in the form `src/.../xxx.lambda.ts`
 * under the source directory with an exported `handler` function. This is the
 * entrypoint of the AWS Lambda function.
 */
function newLambdaHandler(entrypoint) {
  project.addDevDeps('pascal-case');

  if (!entrypoint.startsWith(project.srcdir)) {
    throw new Error(`${entrypoint} must be under ${project.srcdir}`);
  }

  if (!entrypoint.endsWith('.lambda.ts')) {
    throw new Error(`${entrypoint} must have a .lambda.ts extension`);
  }

  entrypoint = relative(project.srcdir, entrypoint);

  const base = basename(entrypoint, '.lambda.ts');
  const dir = join(dirname(entrypoint), base);
  const entry = `${project.srcdir}/${entrypoint}`;
  const infra = `${project.srcdir}/${dir}.ts`;
  const outdir = `${project.libdir}/${dir}.bundle`;
  const outfile = `${outdir}/index.js`;
  const className = pascalCase(basename(dir));
  const propsName = `${className}Props`;

  const ts = new SourceCode(project, infra);
  ts.line(`// ${FileBase.PROJEN_MARKER}`);
  ts.line('import * as path from \'path\';');
  ts.line('import * as lambda from \'@aws-cdk/aws-lambda\';');
  ts.line('import { Construct } from \'constructs\';');
  ts.line();
  ts.open(`export interface ${propsName} extends lambda.FunctionOptions {`);
  ts.close('}');
  ts.line();
  ts.open(`export class ${className} extends lambda.Function {`);
  ts.open(`constructor(scope: Construct, id: string, props: ${propsName} = {}) {`);
  ts.open('super(scope, id, {');
  ts.line('runtime: lambda.Runtime.NODEJS_14_X,');
  ts.line('handler: \'index.handler\',');
  ts.line(`code: lambda.Code.fromAsset(path.join(__dirname, '/${basename(outdir)}')),`);
  ts.line('...props,');
  ts.close('});');
  ts.close('}');
  ts.close('}');

  const bundle = project.addTask(`bundle:${base}`, {
    description: `Create an AWS Lambda bundle from ${entry}`,
    exec: [
      'esbuild',
      '--bundle',
      entry,
      '--target="node14"',
      '--platform="node"',
      `--outfile="${outfile}"`,
      '--external:aws-sdk',
    ].join(' '),
  });

  project.compileTask.spawn(bundle);
  bundleTask.spawn(bundle);
  console.error(`${base}: construct "${className}" under "${infra}"`);
  console.error(`${base}: bundle task "${bundle.name}"`);
}

/**
 * Auto-discovers all lambda functions.
 */
function discoverLambdas() {
  // allow .lambda code to import dev-deps (since they are only needed during bundling)
  project.eslint.allowDevDeps('src/**/*.lambda.ts');
  project.addDevDeps('glob');
  for (const entry of glob.sync('src/**/*.lambda.ts')) {
    newLambdaHandler(entry);
  }
}

// extract the "build/" directory from "construct-hub-webapp" into "./website"
// and bundle it with this library. this way, we are only taking a
// dev-dependency on the webapp instead of a normal/bundled dependency.
project.addDevDeps('construct-hub-webapp');
project.compileTask.prependExec('cp -r ./node_modules/construct-hub-webapp/build ./website');
project.npmignore.addPatterns('!/website'); // <-- include in tarball
project.gitignore.addPatterns('/website'); // <-- don't commit

addDevApp();
discoverLambdas();

project.synth();
