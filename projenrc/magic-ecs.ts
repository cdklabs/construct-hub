import { basename, dirname, join, relative } from 'path';
import Case from 'case';
import * as glob from 'glob';
import { SourceCode } from 'projen';
import { TypeScriptProject } from 'projen/lib/typescript';

const BUNDLE_DIR_ENV = 'BUNDLE_DIR';
const ECS_TASK_MEMORY_LIMIT_DEFINITIONS: { [key: string]: number } = {
  'backend/transliterator/transliterator.ecstask.ts': 8192,
};

function newEcsTask(project: TypeScriptProject, entrypoint: string) {
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
  main.line('// Heartbeat is expected every 5min');
  main.line('const heartbeat = setInterval(sendHeartbeat, 90_000);');
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
  df.line(
    'RUN yum install https://rpm.nodesource.com/pub_16.x/nodistro/repo/nodesource-release-nodistro-1.noarch.rpm -y \\'
  );
  df.line(
    ' && yum install nodejs -y --setopt=nodesource-nodejs.module_hotfixes=1 \\'
  );
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
    } --enable-source-maps"`
  );
  df.line();
  df.line(`ENTRYPOINT ["/usr/bin/env", "node", "/bundle/${dockerEntry}"]`);

  const bundleCmd = [
    'ts-node',
    relative(
      join(__dirname, '..'), // package root
      join('projenrc', 'bundle-javascript-for-ecs.exec.ts')
    ),
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
  project.tasks.tryFind('bundle')?.spawn(bundle);
  console.error(`${base}: construct "${className}" under "${infra}"`);
  console.error(`${base}: bundle task "${bundle.name}"`);
  console.error(`${base}: bundle watch task "${bundleWatch.name}"`);
}

export function discoverEcsTasks(project: TypeScriptProject) {
  const entrypoints = new Array<string>();

  // allow .fargate code to import dev-deps (since they are only needed during bundling)
  project.eslint?.allowDevDeps('src/**/*.ecstask.ts');
  project.eslint?.allowDevDeps('src/**/*.ecs-entrypoint.ts');

  for (const entry of glob.sync('src/**/*.ecstask.ts')) {
    newEcsTask(project, entry);
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
      '--target="node18"',
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
