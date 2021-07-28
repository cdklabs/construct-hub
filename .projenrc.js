const { basename, join, dirname, relative } = require('path');
const glob = require('glob');
const { pascalCase } = require('pascal-case');
const { SourceCode, FileBase, JsonFile, JsiiProject, DependenciesUpgradeMechanism } = require('projen');

const peerDeps = [
  '@aws-cdk/aws-certificatemanager',
  '@aws-cdk/aws-cloudfront-origins',
  '@aws-cdk/aws-cloudfront',
  '@aws-cdk/aws-cloudwatch-actions',
  '@aws-cdk/aws-cloudwatch',
  '@aws-cdk/aws-codeartifact',
  '@aws-cdk/aws-ec2',
  '@aws-cdk/aws-efs',
  '@aws-cdk/aws-events',
  '@aws-cdk/aws-events-targets',
  '@aws-cdk/assets',
  '@aws-cdk/aws-iam',
  '@aws-cdk/aws-lambda-event-sources',
  '@aws-cdk/aws-lambda',
  '@aws-cdk/aws-logs',
  '@aws-cdk/aws-route53-targets',
  '@aws-cdk/aws-route53',
  '@aws-cdk/aws-s3-deployment',
  '@aws-cdk/aws-s3',
  '@aws-cdk/aws-s3-notifications',
  '@aws-cdk/aws-sns',
  '@aws-cdk/aws-sqs',
  '@aws-cdk/aws-stepfunctions',
  '@aws-cdk/aws-stepfunctions-tasks',
  '@aws-cdk/core',
  '@aws-cdk/custom-resources',
  '@aws-cdk/cx-api',
  'cdk-watchful',
  'constructs',
];

const cdkAssert = '@aws-cdk/assert';
const cdkCli = 'aws-cdk';

const project = new JsiiProject({
  name: 'construct-hub',
  description: 'A construct library that model Construct Hub instances.',
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
    cdkAssert,
    ...peerDeps,
    '@jsii/spec',
    '@types/fs-extra',
    '@types/semver',
    '@types/tar-stream',
    cdkCli,
    'aws-embedded-metrics',
    'aws-sdk-mock',
    'aws-sdk',
    'aws-xray-sdk-core',
    'esbuild',
    'fs-extra',
    'got',
    'semver',
    'tar-stream',
    'yaml',
    'nano',
    'normalize-registry-metadata',
  ],

  peerDeps: peerDeps,

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

  // see https://github.com/cdklabs/construct-hub/issues/60
  // publishToMaven: {
  //   javaPackage: 'software.amazon.constructhub',
  //   mavenArtifactId: 'software.amazon.constructhub',
  //   mavenGroupId: 'construct-hub',
  //   mavenEndpoint: 'https://aws.oss.sonatype.org',
  // },

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

  // Exclude handler images from TypeScript compier path
  excludeTypescript: ['resources/**'],
  autoApproveOptions: {
    allowedUsernames: ['aws-cdk-automation'],
    secret: 'GITHUB_TOKEN',
  },
  autoApproveUpgrades: true,
  depsUpgrade: DependenciesUpgradeMechanism.githubWorkflow({
    exclude: [...peerDeps, cdkAssert, cdkCli],
    ignoreProjen: false,
    workflowOptions: {
      labels: ['auto-approve'],
      secret: 'CDK_AUTOMATION_GITHUB_TOKEN',
      container: {
        image: 'jsii/superchain',
      },
    },
  }),
});

function addDevApp() {
  // add "dev:xxx" tasks for interacting with the dev stack
  const devapp = 'lib/__tests__/devapp';
  const commands = ['synth', 'diff', 'deploy', 'destroy', 'bootstrap'];
  for (const cmd of commands) {
    project.addTask(`dev:${cmd}`, {
      description: `cdk ${cmd}`,
      cwd: devapp,
      exec: `npx cdk ${cmd}`,
    });
  }

  project.gitignore.addPatterns(`${devapp}/cdk.out`);

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

/**
 * Adds `integ:xxx` tasks for integration tests based on all files with the
 * `.integ.ts` extension, which are used as CDK application entrypoints.
 *
 * To run an integration test, just run `yarn integ:xxx` (with your environment
 * set up to your AWS development account).
 */
function discoverIntegrationTests() {
  const files = glob.sync('**/*.integ.ts', { cwd: project.srcdir });
  for (const entry of files) {
    console.log(`integration test: ${entry}`);
    const name = basename(entry, '.integ.ts');

    const libdir = join(project.libdir, dirname(entry));
    const srcdir = join(project.srcdir, dirname(entry));

    const deploydir = join(srcdir, `.tmp.${name}.integ.cdkout.deploy`);
    const actualdir = join(srcdir, `.tmp.${name}.integ.cdkout.actual`);
    const snapshotdir = join(srcdir, `${name}.integ.cdkout`);

    const app = `"node ${join(libdir, basename(entry, '.ts'))}.js"`;

    const options = [
      `--app ${app}`,
      '--no-version-reporting',
    ].join(' ');

    const deploy = project.addTask(`integ:${name}:deploy`, {
      description: `deploy integration test ${entry}`,
    });

    deploy.exec(`rm -fr ${deploydir}`);
    deploy.exec(`cdk deploy ${options} --require-approval=never -o ${deploydir}`);

    // if deployment was successful, copy the deploy dir to the expected dir
    deploy.exec(`rm -fr ${snapshotdir}`);
    deploy.exec(`mv ${deploydir} ${snapshotdir}`);

    const destroy = project.addTask(`integ:${name}:destroy`, {
      description: `destroy integration test ${entry}`,
      exec: `cdk destroy --app ${snapshotdir}`,
    });

    deploy.spawn(destroy);

    const assert = project.addTask(`integ:${name}:assert`, {
      description: `synthesize integration test ${entry}`,
    });

    const exclude = ['asset.*', 'cdk.out', 'manifest.json', 'tree.json'];

    assert.exec(`cdk synth ${options} -o ${actualdir} > /dev/null`);
    assert.exec(`diff -r ${exclude.map(x => `-x ${x}`).join(' ')} ${snapshotdir}/ ${actualdir}/`);

    project.addTask(`integ:${name}:snapshot`, {
      description: `update snapshot for integration test ${entry}`,
      exec: `cdk synth ${options} -o ${snapshotdir} > /dev/null`,
    });

    // synth as part of our tests, which means that if outdir changes, anti-tamper will fail
    project.testTask.spawn(assert);
    project.addGitIgnore(`!${snapshotdir}`); // commit outdir to git but not assets

    // do not commit all files we are excluding
    for (const x of exclude) {
      project.addGitIgnore(`${snapshotdir}/${x}`);
      project.addGitIgnore(`${snapshotdir}/**/${x}`); // nested assemblies
    }

    project.addGitIgnore(deploydir);
    project.addPackageIgnore(deploydir);
    project.addGitIgnore(actualdir);
    project.addPackageIgnore(actualdir);

    // commit the snapshot (but not into the tarball)
    project.addGitIgnore(`!${snapshotdir}`);
    project.addPackageIgnore(snapshotdir);
  }
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
 *
 * @param trigger trigger this handler during deployment
 */
function newLambdaHandler(entrypoint, trigger) {
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
  ts.line('import { Construct } from \'@aws-cdk/core\';');
  if (trigger) {
    ts.line('import { AfterCreate } from \'cdk-triggers\';');
  }

  ts.line();
  ts.open(`export interface ${propsName} extends lambda.FunctionOptions {`);
  if (trigger) {
    ts.line('/**');
    ts.line(' * Trigger this handler after these constructs were deployed.');
    ts.line(' * @default - trigger this handler after all implicit dependencies have been created');
    ts.line(' */');
    ts.line('readonly invokeAfter?: Construct[];');
  }
  ts.close('}');
  ts.line();
  ts.open(`export class ${className} extends lambda.Function {`);
  // NOTE: unlike the array splat (`[...arr]`), the object splat (`{...obj}`) is
  //       `undefined`-safe. We can hence save an unnecessary object allocation
  //       by not specifying a default value for the `props` argument here.
  ts.open(`constructor(scope: Construct, id: string, props?: ${propsName}) {`);
  ts.open('super(scope, id, {');
  ts.line(`description: '${entrypoint}',`);
  ts.line('...props,');
  ts.line('runtime: lambda.Runtime.NODEJS_14_X,');
  ts.line('handler: \'index.handler\',');
  ts.line(`code: lambda.Code.fromAsset(path.join(__dirname, '/${basename(outdir)}')),`);
  ts.close('});');
  if (trigger) {
    ts.line();
    ts.open('new AfterCreate(this, \'Trigger\', {');
    ts.line('handler: this,');
    ts.line('resources: props?.invokeAfter,');
    ts.close('});');
  }
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
  // Allow .lambda-shared code to import dev-deps (these are not entry points, but are shared by several lambdas)
  project.eslint.allowDevDeps('src/**/*.lambda-shared.ts');
  project.addDevDeps('glob');
  for (const entry of glob.sync('src/**/*.lambda.ts')) {
    const trigger = basename(entry).startsWith('trigger.');
    newLambdaHandler(entry, trigger);
  }

  // Add the AWS Lambda type definitions, and ignore that it never resolves
  project.addDevDeps('@types/aws-lambda');
  const noUnresolvedRule = project.eslint && project.eslint.rules['import/no-unresolved'];
  if (noUnresolvedRule != null) {
    noUnresolvedRule[1] = { ...noUnresolvedRule[1] || {}, ignore: [...(noUnresolvedRule[1] || {}).ignore || [], 'aws-lambda'] };
  }
}

// extract the "build/" directory from "construct-hub-webapp" into "./website"
// and bundle it with this library. this way, we are only taking a
// dev-dependency on the webapp instead of a normal/bundled dependency.
project.addDevDeps('construct-hub-webapp');
project.addDevDeps('cdk-triggers');
project.compileTask.prependExec('cp -r ./node_modules/construct-hub-webapp/build ./website');
project.compileTask.prependExec('rm -rf ./website');
project.npmignore.addPatterns('!/website'); // <-- include in tarball
project.gitignore.addPatterns('/website'); // <-- don't commit

addDevApp();
discoverLambdas();
discoverIntegrationTests();

project.synth();
