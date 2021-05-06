const { basename, join, dirname, relative } = require('path');
const glob = require('glob');
const { pascalCase } = require('pascal-case');
const { AwsCdkConstructLibrary, SourceCode, FileBase } = require('projen');

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
  authorAddress: 'construct-ecosystem-team@amazon.com',
  authorOrganization: true,

  cdkVersion: '1.100.0',

  cdkDependencies: [
    '@aws-cdk/core',
    '@aws-cdk/cx-api',
    '@aws-cdk/aws-cloudwatch',
    '@aws-cdk/aws-certificatemanager',
    '@aws-cdk/aws-route53',
    '@aws-cdk/aws-lambda',
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
  const devapp = project.testdir + '/devapp';
  const commands = ['bootstrap', 'synth', 'diff', 'deploy'];
  for (const cmd of commands) {
    project.addTask(`dev:${cmd}`, {
      description: `cdk ${cmd}`,
      cwd: devapp,
      exec: `npx cdk ${cmd}`,
    });
  }

  project.gitignore.addPatterns(`${devapp}/cdk.out`);
  project.addDevDeps('ts-node');
  project.addDevDeps(`aws-cdk@${project.cdkVersion}`);
}

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
  const entry = `src/${entrypoint}`;
  const infra = `src/${dir}.ts`;
  const outdir = `lib/${dir}.bundle`;
  const outfile = `${outdir}/index.js`;
  const className = pascalCase(basename(dir));
  const propsName = `${className}Props`;

  const ts = new SourceCode(project, infra);
  ts.line(`// ${FileBase.PROJEN_MARKER}`);
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
  ts.line(`code: lambda.Code.fromAsset(__dirname + '/${basename(outdir)}'),`);
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
  console.error(`${base}: construct "${className}" under "${infra}"`);
  console.error(`${base}: bundle task "${bundle.name}"`);
}

/**
 * Auto-discovers all lambda functions.
 */
function discoverLambdas() {
  project.addDevDeps('glob');
  for (const entry of glob.sync('src/**/*.lambda.ts')) {
    newLambdaHandler(entry);
  }
}

addDevApp();
discoverLambdas();

project.synth();
