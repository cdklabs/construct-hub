import fs from 'fs';
import { basename, join, dirname, relative } from 'path';
import Case from 'case';
import * as glob from 'glob';
import { SourceCode, JsonFile, cdk, github } from 'projen';
import spdx from 'spdx-license-list';
import * as uuid from 'uuid';

const BUNDLE_DIR_ENV = 'BUNDLE_DIR';

const peerDeps = [
  '@aws-cdk/aws-servicecatalogappregistry-alpha',
  'aws-cdk-lib',
  'cdk-watchful',
  'constructs',
];

const cdkCli = 'aws-cdk@^2';

const project = new cdk.JsiiProject({
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
    'tar-stream',
    'uuid',
    'yaml',
    'normalize-registry-metadata',
    '@octokit/rest',
    'markdown-it',
    'markdown-it-emoji',
    'changelog-filename-regex',
    '@types/markdown-it',
    '@types/markdown-it-emoji',
    '@types/changelog-filename-regex',
  ],

  peerDeps: peerDeps,

  minNodeVersion: '16.16.0',
  jsiiVersion: '5.1.x',

  pullRequestTemplateContents: [
    '',
    '----',
    '',
    '*By submitting this pull request, I confirm that my contribution is made under the terms of the Apache-2.0 license*',
  ],

  releaseToNpm: true,

  // publishToGo: {
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
});

project.tasks.addEnvironment('NODE_OPTIONS', '--max-old-space-size=4096');

// create component diagram
project.setScript(
  'dia',
  'yarn dev:synth && cd lib/__tests__/devapp && npx cdk-dia && mv diagram.png ../../../diagrams/diagram.png'
);

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

project.addGitIgnore(
  '!src/__tests__/backend/transliterator/fixtures/tests/package.tgz'
);

function addVpcAllowListManagement() {
  const workflow = project.github?.addWorkflow('update-vpc-acl-allow-lists');

  const prTitle = 'chore: upgrade network ACL allow-lists';
  const prBody =
    'Updated the network ACL allow-lists from authoritative sources.';

  workflow?.addJobs({
    update: {
      permissions: {
        actions: github.workflows.JobPermission.WRITE,
        contents: github.workflows.JobPermission.WRITE,
        pullRequests: github.workflows.JobPermission.WRITE,
      },
      runsOn: ['ubuntu-latest'],
      steps: [
        {
          name: 'Check Out',
          uses: 'actions/checkout@v2',
        },
        // Update the NPM IP ranges (they are fronted by CloudFlare)
        // See: https://npm.community/t/registry-npmjs-org-ip-address-range/5853.html
        {
          name: 'Update CloudFlare IP lists',
          // See: https://www.cloudflare.com/ips
          run: [
            'curl -SsL "https://www.cloudflare.com/ips-v4" \\',
            '     -o resources/vpc-allow-lists/cloudflare-IPv4.txt',
            //// We do not emit IPv6 allow-lists as our VPC does not have IPv6 support
            // 'curl -SsL "https://www.cloudflare.com/ips-v6" \\',
            // '     -o resources/vpc-allow-lists/cloudflare-IPv6.txt',
          ].join('\n'),
        },
        // Allowing GitHub (web and git)
        {
          name: 'Setup Node',
          uses: 'actions/setup-node@v2',
        },
        {
          name: 'Update GitHub IP lists',
          // See: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-githubs-ip-addresses
          run: 'node ./update-github-ip-allowlist.js',
        },
        // And now make a PR if necessary
        {
          name: 'Make Pull Request',
          uses: 'peter-evans/create-pull-request@v3',
          with: {
            token: project?.github?.projenCredentials.tokenRef,
            branch: `automation/${workflow.name}`,
            'commit-message': `${prTitle}\n\n${prBody}`,
            title: prTitle,
            body: prBody,
            labels: 'auto-approve',
            author: 'github-actions <github-actions@github.com>',
            committer: 'github-actions <github-actions@github.com>',
            signoff: true,
          },
        },
      ],
    },
  });

  // This workflow runs every day at 13:37.
  workflow?.on({ schedule: [{ cron: '37 13 * * *' }] });

  project.npmignore?.addPatterns('/update-github-ip-allowlist.js');
}

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
  project.addTask('dev:hotswap', {
    description: 'cdk deploy --hotswap',
    cwd: devapp,
    exec: 'npx cdk deploy --hotswap',
  });

  project.gitignore.addPatterns(`${devapp}/cdk.out`);
  project.gitignore.addPatterns('.env');

  new JsonFile(project, `${devapp}/cdk.json`, {
    obj: {
      app: 'node main.js',
      context: {
        '@aws-cdk/core:newStyleStackSynthesis': true,
        '@aws-cdk/aws-apigateway:usagePlanKeyOrderInsensitiveId': true,
        'aws-cdk:enableDiffNoFail': 'true',
        '@aws-cdk/core:stackRelativeExports': 'true',
        '@aws-cdk/aws-secretsmanager:parseOwnedSecretName': true,
        '@aws-cdk/aws-kms:defaultKeyPolicies': true,
        '@aws-cdk/aws-ecs-patterns:removeDefaultDesiredCount': true,
        '@aws-cdk/aws-rds:lowercaseDbIdentifier': true,
        '@aws-cdk/aws-efs:defaultEncryptionAtRest': true,
        '@aws-cdk/aws-iam:minimizePolicies': true,
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
      '--context @aws-cdk/core:newStyleStackSynthesis=true',
    ].join(' ');

    const deploy = project.addTask(`integ:${name}:deploy`, {
      description: `deploy integration test ${entry}`,
    });

    if (name === 'transliterator.ecstask') {
      deploy.exec(
        'cp -r src/__tests__/backend/transliterator/fixtures lib/__tests__/backend/transliterator'
      );
    }
    deploy.exec(`rm -fr ${deploydir}`);
    deploy.exec(
      `cdk deploy ${options} --require-approval=never -o ${deploydir}`
    );

    // if deployment was successful, copy the deploy dir to the expected dir
    deploy.exec(`rm -fr ${snapshotdir}`);
    deploy.exec(`mv ${deploydir} ${snapshotdir}`);

    const destroy = project.addTask(`integ:${name}:destroy`, {
      description: `destroy integration test ${entry}`,
      exec: `cdk destroy --app ${snapshotdir} --no-version-reporting`,
    });

    deploy.spawn(destroy);

    const assert = project.addTask(`integ:${name}:assert`, {
      description: `synthesize integration test ${entry}`,
    });

    const exclude = [
      'asset.*',
      'cdk.out',
      'manifest.json',
      'tree.json',
      '.cache',
    ];

    if (name === 'transliterator.ecstask') {
      assert.exec(
        'cp -r src/__tests__/backend/transliterator/fixtures lib/__tests__/backend/transliterator'
      );
    }
    assert.exec(`cdk synth ${options} -o ${actualdir} > /dev/null`);
    assert.exec(
      `diff -r ${exclude
        .map((x) => `-x ${x}`)
        .join(' ')} ${snapshotdir}/ ${actualdir}/`
    );

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

const bundleTask = project.addTask('bundle', {
  description: 'Bundle all lambda and ECS functions',
});

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
function newLambdaHandler(entrypoint: string, trigger: boolean) {
  if (!entrypoint.startsWith(project.srcdir)) {
    throw new Error(`${entrypoint} must be under ${project.srcdir}`);
  }

  if (!entrypoint.endsWith('.lambda.ts')) {
    throw new Error(`${entrypoint} must have a .lambda.ts extension`);
  }

  // We identify singleton functions by a "/// @singleton [purpose]" comment in the handler source.
  const [isSingleton, singletonPurpose] =
    /^[/]{3}[ \t]*@singleton(?:[ \t]+(.*?))?[ \t]*$/m.exec(
      fs.readFileSync(entrypoint, 'utf-8')
    ) || [];

  entrypoint = relative(project.srcdir, entrypoint);

  const base = basename(entrypoint, '.lambda.ts');
  const dir = join(dirname(entrypoint), base);
  const entry = `${project.srcdir}/${entrypoint}`;
  const infra = `${project.srcdir}/${dir}.ts`;
  const outdir = `${project.libdir}/${dir}.lambda.bundle`;
  const outfile = `${outdir}/index.js`;
  const className = Case.pascal(basename(dir));
  const propsName = `${className}Props`;

  const ts = new SourceCode(project, infra);
  ts.line(`// ${ts.marker}`);
  ts.line("import * as path from 'path';");
  if (trigger) {
    ts.line("import { CustomResourceProvider, Stack } from 'aws-cdk-lib';");
    ts.line("import * as iam from 'aws-cdk-lib/aws-iam';");
  }
  ts.line("import * as lambda from 'aws-cdk-lib/aws-lambda';");
  if (trigger) {
    ts.line("import { Trigger } from 'aws-cdk-lib/triggers';");
  }
  ts.line("import { Construct } from 'constructs';");

  ts.line();
  ts.open(`export interface ${propsName} extends lambda.FunctionOptions {`);
  if (trigger) {
    ts.line('/**');
    ts.line(' * Trigger this handler after these constructs were deployed.');
    ts.line(
      ' * @default - trigger this handler after all implicit dependencies have been created'
    );
    ts.line(' */');
    ts.line('readonly executeAfter?: Construct[];');
  }
  ts.close('}');
  ts.line();
  ts.open(
    `export class ${className} extends lambda.${
      isSingleton ? 'SingletonFunction' : 'Function'
    } {`
  );
  // NOTE: unlike the array splat (`[...arr]`), the object splat (`{...obj}`) is
  //       `undefined`-safe. We can hence save an unnecessary object allocation
  //       by not specifying a default value for the `props` argument here.
  ts.open(`constructor(scope: Construct, id: string, props?: ${propsName}) {`);
  ts.open('super(scope, id, {');
  ts.line(`description: '${entrypoint}',`);
  ts.line('...props,');
  if (isSingleton) {
    const SINGLETON_NAMESPACE = '0E7DE892-DDD6-42B0-9709-07C5B8E0965E';
    ts.line(`uuid: '${uuid.v5(entrypoint, SINGLETON_NAMESPACE)}',`);
    if (singletonPurpose) {
      ts.line(
        `lambdaPurpose: '${singletonPurpose.replace(/([\\'])/g, '\\$1')}',`
      );
    }
  }
  ts.line('architecture: lambda.Architecture.ARM_64,');
  ts.line('runtime: lambda.Runtime.NODEJS_16_X,');
  ts.line("handler: 'index.handler',");
  ts.line(
    `code: lambda.Code.fromAsset(path.join(__dirname, '/${basename(outdir)}')),`
  );
  ts.close('});');
  if (trigger) {
    ts.line();
    ts.open("new Trigger(this, 'Trigger', {");
    ts.line('handler: this,');
    ts.line('executeAfter: props?.executeAfter,');
    ts.close('});');
    ts.line();
    // hacky workaround for https://github.com/aws/aws-cdk/issues/19272
    ts.line(
      "const provider = Stack.of(scope).node.tryFindChild('AWSCDK.TriggerCustomResourceProviderCustomResourceProvider') as CustomResourceProvider;"
    );
    ts.line('');
    ts.line("new iam.Policy(this, 'Policy', {");
    ts.line('  force: true,');
    ts.line("  roles: [iam.Role.fromRoleArn(this, 'Role', provider.roleArn)],");
    ts.line('  statements: [');
    ts.line('    new iam.PolicyStatement({');
    ts.line('      effect: iam.Effect.ALLOW,');
    ts.line("      actions: ['lambda:InvokeFunction'],");
    ts.line('      resources: [`${this.functionArn}*`],');
    ts.line('    }),');
    ts.line('  ],');
    ts.line('});');
  }
  ts.close('}');
  ts.close('}');

  const bundleCmd = [
    'esbuild',
    '--bundle',
    entry,
    '--target="node16"',
    '--platform="node"',
    `--outfile="${outfile}"`,
    '--external:aws-sdk',
    '--sourcemap',
    '--tsconfig=tsconfig.dev.json',
  ];
  const bundle = project.addTask(`bundle:${base}`, {
    description: `Create an AWS Lambda bundle from ${entry}`,
    exec: bundleCmd.join(' '),
  });
  const bundleWatch = project.addTask(`bundle:${base}:watch`, {
    description: `Continuously update an AWS Lambda bundle from ${entry}`,
    exec: [...bundleCmd, '--watch'].join(' '),
  });

  project.compileTask.spawn(bundle);
  bundleTask.spawn(bundle);
  console.error(`${base}: construct "${className}" under "${infra}"`);
  console.error(`${base}: bundle task "${bundle.name}"`);
  console.error(`${base}: bundle watch task "${bundleWatch.name}"`);
}

function newEcsTask(entrypoint: string) {
  if (!entrypoint.startsWith(project.srcdir)) {
    throw new Error(`${entrypoint} must be under ${project.srcdir}`);
  }

  if (!entrypoint.endsWith('.ecstask.ts')) {
    throw new Error(`${entrypoint} must have a .ecstask.ts extension`);
  }

  // This uses the AWS SDK v3 client to achieve a smaller bundle size.
  project.addDevDeps('@aws-sdk/client-sfn');

  entrypoint = relative(project.srcdir, entrypoint);

  const base = basename(entrypoint, '.ecstask.ts');
  const dir = join(dirname(entrypoint), base);
  const dockerEntry = 'index.js';
  const entry = `${project.srcdir}/${entrypoint}`;
  const infra = `${project.srcdir}/${dir}.ts`;
  const outdir = `${project.libdir}/${dir}.ecs-entrypoint.bundle`;
  const ecsMain = `${project.srcdir}/${dir}.ecs-entrypoint.ts`;
  const dockerfile = `${outdir}/Dockerfile`;
  const className = Case.pascal(basename(dir));
  const propsName = `${className}Props`;

  const memoryLimit = ECS_TASK_MEMORY_LIMIT_DEFINITIONS[entrypoint];
  if (!memoryLimit) {
    throw new Error(
      `Unable to find memory limit definition for entrypoint: ${entrypoint}`
    );
  }

  const ts = new SourceCode(project, infra);
  ts.line(`// ${ts.marker}`);
  ts.line("import * as path from 'path';");
  ts.line("import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';");
  ts.line("import * as ecs from 'aws-cdk-lib/aws-ecs';");
  ts.line("import * as iam from 'aws-cdk-lib/aws-iam';");
  ts.line("import { Construct } from 'constructs';");
  ts.line();
  ts.line(`export const MEMORY_LIMIT = ${memoryLimit}`);
  ts.line();
  ts.open(
    `export interface ${propsName} extends Omit<ecs.ContainerDefinitionOptions, 'image'> {`
  );
  ts.line('readonly taskDefinition: ecs.FargateTaskDefinition;');
  ts.close('}');
  ts.line();
  ts.open(`export class ${className} extends ecs.ContainerDefinition {`);
  ts.open(
    `public constructor(scope: Construct, id: string, props: ${propsName}) {`
  );
  ts.open('super(scope, id, {');
  ts.line('...props,');
  ts.line(
    `image: ecs.ContainerImage.fromAsset(path.join(__dirname, '${basename(
      outdir
    )}'), { platform: ecrAssets.Platform.LINUX_ARM64 }),`
  );
  ts.close('});');
  ts.line();
  ts.open(
    'props.taskDefinition.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({'
  );
  ts.line('effect: iam.Effect.ALLOW,');
  ts.open('actions: [');
  ts.line("'states:SendTaskFailure',");
  ts.line("'states:SendTaskHeartbeat',");
  ts.line("'states:SendTaskSuccess',");
  ts.close('],');
  ts.line("resources: ['*'],");
  ts.close('}));');
  ts.close('}');
  ts.close('}');

  // This is created in the source-tree so that the generated handler gets type-checked and linted
  // like the rest of the code. IT also gets processed by tsc/esbuild, which means it'll get the
  // appropriate down-leveling (e.g: for use of the `??` operator).
  const main = new SourceCode(project, ecsMain);
  main.line('#!/usr/bin/env node');
  main.line(`// ${main.marker}`);
  main.line();
  main.line("import { execFileSync } from 'node:child_process';");
  main.line("import * as os from 'node:os';");
  main.line("import { argv, env, exit } from 'node:process';");
  main.line("import { getHeapSpaceStatistics } from 'node:v8';");
  main.line(
    "import { SendTaskFailureCommand, SendTaskHeartbeatCommand, SendTaskSuccessCommand, SFNClient } from '@aws-sdk/client-sfn';"
  );
  main.line(`import { handler } from './${basename(entrypoint, '.ts')}';`);
  main.line();
  main.line('const sfn = new SFNClient({});');
  main.line();
  main.line('const taskToken = env.SFN_TASK_TOKEN!;');

  // Remove the SFN_TASK_TOKEN from the environment, so arbitrary code does not get to use it to mess up with our state machine's state
  main.line('delete env.SFN_TASK_TOKEN;');
  main.line();

  // A heartbeat is sent every minute to StepFunctions.
  main.open('function sendHeartbeat(): void {');
  // We don't return the promise as it is fully handled within the call. This prevents eslint from declaring a false
  // positive unhandled promise on call sites.
  main.open('sfn.send(new SendTaskHeartbeatCommand({ taskToken })).then(');
  main.line("() => console.log('Successfully sent task heartbeat!'),");
  main.open('(reason) => {');
  main.line("console.error('Failed to send task heartbeat:', reason);");
  // If the heartbeat fails with a 400 (InvalidToken, TaskDoesNotExist, TaskTimedOut),
  // we will exit the VM right away, as the requesting StepFunctions execution is no longer
  // interested in the result of this run. This avoids keeping left-over tasks lying around "forever".
  // See: https://docs.aws.amazon.com/step-functions/latest/apireference/API_SendTaskHeartbeat.html#API_SendTaskHeartbeat_Errors
  main.open('if (reason.$metadata.httpStatusCode === 400) {');
  main.line('exit(-(os.constants.errno.ETIMEDOUT || 1));');
  main.close('}');
  main.close('},');
  main.close(');');
  // Output heap space statistics, for information...
  main.open(
    'const heapStats = Object.fromEntries(getHeapSpaceStatistics().filter(({ space_size }) => space_size > 0).map('
  );
  main.open('(space) => [');
  main.line('space.space_name,');
  main.open('{');
  main.line('size: space.space_size,');
  main.line('utilization: 100 * space.space_used_size / space.space_size,');
  main.close('}');
  main.close(']');
  main.close('));');
  main.line('console.log(JSON.stringify(heapStats));');
  // Run lsof to output the list of open file descriptors, for information... but only if $RUN_LSOF_ON_HEARTBEAT is et
  main.open('if (env.RUN_LSOF_ON_HEARTBEAT) {');
  main.line(
    "execFileSync('/usr/sbin/lsof', ['-g', '-n', '-P', '-R'], { stdio: 'inherit' });"
  );
  main.close('}');
  main.close('}');
  main.line();

  main.open('async function main(): Promise<void> {');
  main.line('const heartbeat = setInterval(sendHeartbeat, 180_000);'); // Heartbeat is only expected every 10min
  main.line('try {');
  // Deserialize the input, which ECS provides as a sequence of JSON objects. We skip the first 2 values (argv[0] is the
  // node binary, and argv[1] is this JS file).
  main.line(
    '  const input: readonly any[] = argv.slice(2).map((text) => JSON.parse(text));'
  );
  main.line();
  // If any object argument includes a string-typed env.RUN_LSOF_ON_HEARTBEAT property, set this as the
  // RUN_LSOF_ON_HEARTBEAT environment variable before proceeding.
  main.open(
    '  const envArg: { env: { RUN_LSOF_ON_HEARTBEAT: string } } | undefined = input.find('
  );
  main.line('  (arg) =>');
  main.line("    typeof arg === 'object'");
  main.line("    && typeof arg?.env === 'object'");
  main.line("    && typeof arg?.env?.RUN_LSOF_ON_HEARTBEAT === 'string'");
  main.close('  );');
  main.open('  if (envArg != null) {');
  main.line('  env.RUN_LSOF_ON_HEARTBEAT = envArg.env.RUN_LSOF_ON_HEARTBEAT;');
  main.close('  }');
  main.line();

  // Make sure a heartbeat is sent now that we have an input and are ready to go...
  main.line('  sendHeartbeat();');
  main.line();

  // Casting as opaque function so we evade the type-checking of the handler (can't generalize that)
  main.line(
    '  const result = await (handler as (...args: any[]) => unknown)(...input);'
  );
  main.line("  console.log('Task result:', result);");
  main.line(
    '  await sfn.send(new SendTaskSuccessCommand({ output: JSON.stringify(result), taskToken }));'
  );
  main.line('} catch (err: any) {');
  main.line("  console.log('Task failed:', err);");
  main.line('  process.exitCode = 1;');
  main.open('  await sfn.send(new SendTaskFailureCommand({');
  // Note: JSON.stringify(some Error) returns '{}', which is not super helpful...
  main.line(
    '  cause: JSON.stringify(err instanceof Error ? { message: err.message, name: err.name, stack: err.stack } : err),'
  );
  main.line("  error: err.name ?? err.constructor.name ?? 'Error',");
  main.line('  taskToken,');
  main.close('  }));');
  main.line('} finally {');
  main.line('  clearInterval(heartbeat);');
  main.line('}');
  main.close('}');
  main.line();
  main.open('main().catch((cause) => {');
  main.line("console.log('Unexpected error:', cause);");
  main.line('exit(-1);');
  main.close('});');
  main.line();

  const df = new SourceCode(project, dockerfile);
  df.line(`# ${df.marker}`);
  // Based off amazonlinux:2 for... reasons. (Do not change!)
  df.line('FROM public.ecr.aws/amazonlinux/amazonlinux:2');
  df.line();
  // Install node the regular way...
  df.line('RUN curl -fsSL https://rpm.nodesource.com/setup_16.x | bash - \\');
  df.line(' && yum update -y \\');
  df.line(' && yum upgrade -y \\');
  df.line(' && yum install -y git lsof nodejs \\');
  // Clean up the yum cache in the interest of image size
  df.line(' && yum clean all \\');
  df.line(' && rm -rf /var/cache/yum');
  df.line();
  df.line('COPY . /bundle');
  df.line();
  // Override the GIT ssh command to work around git's use of
  // StrictHostKeyChecking=accept-new, which is not supported by the version of
  // openssh that ships in amazonlinux:2. For more information, refer to the
  // following issue: https://github.com/npm/git/issues/31
  df.line('ENV GIT_SSH_COMMAND=ssh');
  // By default, no more than 10 lines of the stack trace are shown. Increase
  // this to help with debugging errors.
  df.line(
    `ENV NODE_OPTIONS="--stack-trace-limit=100 --max-old-space-size=${
      // don't use up the entire container memory
      memoryLimit - 512
    }"`
  );
  df.line();
  df.line(`ENTRYPOINT ["/usr/bin/env", "node", "/bundle/${dockerEntry}"]`);

  const bundleCmd = [
    'ts-node',
    relative(__dirname, join('projenrc', 'bundle-javascript-for-ecs.exec.ts')),
    ecsMain,
    `${outdir}/${dockerEntry}`,
  ];
  const bundle = project.addTask(`bundle:${base}`, {
    description: `Create an AWS Fargate bundle from ${entry}`,
    exec: bundleCmd.join(' '),
  });
  bundle.env(BUNDLE_DIR_ENV, outdir);
  const bundleWatch = project.addTask(`bundle:${base}:watch`, {
    description: `Continuously update an AWS Fargate bundle from ${entry}`,
    exec: [...bundleCmd, '--watch'].join(' '),
  });
  bundleWatch.env(BUNDLE_DIR_ENV, outdir);

  project.compileTask.spawn(bundle);
  bundleTask.spawn(bundle);
  console.error(`${base}: construct "${className}" under "${infra}"`);
  console.error(`${base}: bundle task "${bundle.name}"`);
  console.error(`${base}: bundle watch task "${bundleWatch.name}"`);
}

/**
 * Auto-discovers all lambda functions.
 */
function discoverLambdas() {
  const entrypoints = new Array<string>();

  // allow .lambda code to import dev-deps (since they are only needed during bundling)
  project.eslint?.allowDevDeps('src/**/*.lambda.ts');
  // Allow .lambda-shared code to import dev-deps (these are not entry points, but are shared by several lambdas)
  project.eslint?.allowDevDeps('src/**/*.lambda-shared.ts');
  for (const entry of glob.sync('src/**/*.lambda.ts')) {
    const trigger = basename(entry).startsWith('trigger.');
    newLambdaHandler(entry, trigger);
    entrypoints.push(entry);
  }

  project.addTask('bundle:lambda:watch', {
    description: 'Continuously bundle all AWS Lambda functions',
    exec: [
      'esbuild',
      '--bundle',
      ...entrypoints,
      '--target="node14"',
      '--platform="node"',
      `--outbase="${project.srcdir}"`,
      `--outdir="${project.libdir}"`,
      '--entry-names="[dir]/[name].bundle/index"',
      '--external:aws-sdk',
      '--sourcemap',
      '--watch',
      '--tsconfig=tsconfig.dev.json',
    ].join(' '),
  });

  // Add the AWS Lambda type definitions, and ignore that it never resolves
  project.addDevDeps('@types/aws-lambda');
  const noUnresolvedRule =
    project.eslint && project.eslint.rules['import/no-unresolved'];
  if (noUnresolvedRule != null) {
    noUnresolvedRule[1] = {
      ...(noUnresolvedRule[1] || {}),
      ignore: [...((noUnresolvedRule[1] || {}).ignore || []), 'aws-lambda'],
    };
  }
}

const ECS_TASK_MEMORY_LIMIT_DEFINITIONS: { [key: string]: number } = {
  'backend/transliterator/transliterator.ecstask.ts': 8192,
};

function discoverEcsTasks() {
  const entrypoints = new Array<string>();

  // allow .fargate code to import dev-deps (since they are only needed during bundling)
  project.eslint?.allowDevDeps('src/**/*.ecstask.ts');
  project.eslint?.allowDevDeps('src/**/*.ecs-entrypoint.ts');

  for (const entry of glob.sync('src/**/*.ecstask.ts')) {
    newEcsTask(entry);
    entrypoints.push(entry);
  }

  project.addTask('bundle:fargate:watch', {
    description: 'Continuously bundle all AWS Fargate functions',
    exec: [
      'esbuild',
      '--bundle',
      ...entrypoints.map((file) =>
        file.replace('ecstask.ts', 'ecs-entrypoint.ts')
      ),
      '--target="node16"',
      '--platform="node"',
      `--outbase="${project.srcdir}"`,
      `--outdir="${project.libdir}"`,
      '--entry-names="[dir]/[name].bundle/index"',
      '--external:aws-sdk',
      '--sourcemap',
      '--watch',
    ].join(' '),
  });
}

function generateSpdxLicenseEnum() {
  const ts = new SourceCode(project, 'src/spdx-license.ts');

  ts.line(`// ${ts.marker}`);
  // We *need* the private field to be declared before any public field is...
  ts.line('/* eslint-disable @typescript-eslint/member-ordering */');
  ts.line();
  ts.line('/**');
  ts.line(' * Valid SPDX License identifiers.');
  ts.line(' */');
  ts.open('export class SpdxLicense {');
  ts.line('private static readonly _ALL = new Map<string, SpdxLicense>();');
  ts.line();
  ts.line('//#region Individual SPDX Licenses');
  for (const [id, { name, url, osiApproved }] of Object.entries(spdx)) {
    ts.line('/**');
    ts.line(` * ${name}`);
    if (osiApproved) {
      ts.line(' *');
      ts.line(' * @osiApproved');
    }
    ts.line(' *');
    ts.line(` * @see ${url}`);
    ts.line(' */');
    ts.line(
      `public static readonly ${slugify(id)} = new SpdxLicense('${id}');`
    );
    ts.line();
  }

  ts.line('/** Packages that have not been licensed */');
  ts.line("public static readonly UNLICENSED = new SpdxLicense('UNLICENSED');");
  ts.line('//#endregion');

  ts.line();
  ts.line('//#region Bundles of SPDX Licenses');

  ts.line();
  ts.line('/** All valid SPDX Licenses */');
  ts.open('public static all(): SpdxLicense[] {');
  ts.line('return Array.from(SpdxLicense._ALL.values());');
  ts.close('}');

  ts.line();
  ts.line('/** All OSI-Approved SPDX Licenses */');
  ts.open('public static osiApproved(): SpdxLicense[] {');
  ts.open('return [');
  for (const [id, { osiApproved }] of Object.entries(spdx)) {
    if (!osiApproved) {
      continue;
    }
    ts.line(`SpdxLicense.${slugify(id)},`);
  }
  ts.close('];');
  ts.close('}');

  ts.line();
  ts.line('/** The Apache family of licenses */');
  ts.open('public static apache(): SpdxLicense[] {');
  ts.open('return [');
  for (const id of Object.keys(spdx)) {
    if (id.startsWith('Apache-')) {
      ts.line(`SpdxLicense.${slugify(id)},`);
    }
  }
  ts.close('];');
  ts.close('}');

  ts.line();
  ts.line('/** The BSD family of licenses */');
  ts.open('public static bsd(): SpdxLicense[] {');
  ts.open('return [');
  for (const id of Object.keys(spdx)) {
    if (id === '0BSD' || id.startsWith('BSD-')) {
      ts.line(`SpdxLicense.${slugify(id)},`);
    }
  }
  ts.close('];');
  ts.close('}');

  ts.line();
  ts.line('/** The CDDL family of licenses */');
  ts.open('public static cddl(): SpdxLicense[] {');
  ts.open('return [');
  for (const id of Object.keys(spdx)) {
    if (id.startsWith('CDDL-')) {
      ts.line(`SpdxLicense.${slugify(id)},`);
    }
  }
  ts.close('];');
  ts.close('}');

  ts.line();
  ts.line('/** The EPL family of licenses */');
  ts.open('public static epl(): SpdxLicense[] {');
  ts.open('return [');
  for (const id of Object.keys(spdx)) {
    if (id.startsWith('EPL-')) {
      ts.line(`SpdxLicense.${slugify(id)},`);
    }
  }
  ts.close('];');
  ts.close('}');

  ts.line();
  ts.line('/** The MIT family of licenses */');
  ts.open('public static mit(): SpdxLicense[] {');
  ts.open('return [');
  for (const id of Object.keys(spdx)) {
    if (
      id === 'AML' ||
      id === 'MIT' ||
      id === 'MITNFA' ||
      id.startsWith('MIT-')
    ) {
      ts.line(`SpdxLicense.${slugify(id)},`);
    }
  }
  ts.close('];');
  ts.close('}');

  ts.line();
  ts.line('/** The MPL family of licenses */');
  ts.open('public static mpl(): SpdxLicense[] {');
  ts.open('return [');
  for (const id of Object.keys(spdx)) {
    if (id.startsWith('MPL-')) {
      ts.line(`SpdxLicense.${slugify(id)},`);
    }
  }
  ts.close('];');
  ts.close('}');
  ts.line('//#endregion');

  ts.line();
  ts.open('private constructor(public readonly id: string) {');
  ts.line('/* istanbul ignore if (should never happen) */');
  ts.open('if (SpdxLicense._ALL.has(id)) {');
  ts.line('throw new Error(`Duplicated SPDX License ID: ${id}`);');
  ts.close('}');
  ts.line('SpdxLicense._ALL.set(id, this);');
  ts.close('}');

  ts.close('}');

  function slugify(id: string) {
    // Applying twice - some values don't re-constantize cleanly, and `jsii`
    // will actually check the case by re-constantizing those... This is silly,
    // but fixing that is likely going to be a breaking change T_T.
    return Case.constant(
      Case.constant(
        id.replace(/\+$/, '_Plus').replace(/^(\d)/, (digit: string) => {
          switch (digit) {
            case '0':
              return 'Zero_';
            case '1':
              return 'One_';
            case '2':
              return 'Two_';
            case '3':
              return 'Three_';
            case '4':
              return 'Four_';
            case '5':
              return 'Five_';
            case '6':
              return 'Six_';
            case '7':
              return 'Seven_';
            case '8':
              return 'Eight_';
            case '9':
              return 'Nine_';
            default:
              return digit;
          }
        })
      )
    );
  }
}

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

addVpcAllowListManagement();
addDevApp();

project.addDevDeps('glob');
discoverLambdas();
discoverEcsTasks();
discoverIntegrationTests();

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

generateSpdxLicenseEnum();

// Escape hatch to fix "JavaScript heap out of memory" in GitHub Actions
const buildWorkflow = project.tryFindObjectFile('.github/workflows/build.yml');
buildWorkflow?.addOverride(
  'jobs.build.steps.3.env.NODE_OPTIONS',
  '--max-old-space-size=8192' // 8GB
);

project.synth();
