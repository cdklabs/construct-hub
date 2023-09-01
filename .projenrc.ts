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
  '@aws-cdk/aws-servicecatalogappregistry-alpha',
  'aws-cdk-lib',
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
project.addTask('bundle', {
  description: 'Bundle all lambda and ECS functions',
});

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
