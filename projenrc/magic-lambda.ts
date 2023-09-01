import * as fs from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import Case from 'case';
import * as glob from 'glob';
import { SourceCode } from 'projen';
import { TypeScriptProject } from 'projen/lib/typescript';
import * as uuid from 'uuid';

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
function newLambdaHandler(
  project: TypeScriptProject,
  entrypoint: string,
  trigger: boolean
) {
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
  project.tasks.tryFind('bundle')?.spawn(bundle);
  console.error(`${base}: construct "${className}" under "${infra}"`);
  console.error(`${base}: bundle task "${bundle.name}"`);
  console.error(`${base}: bundle watch task "${bundleWatch.name}"`);
}

/**
 * Auto-discovers all lambda functions.
 */
export function discoverLambdas(project: TypeScriptProject) {
  const entrypoints = new Array<string>();

  // allow .lambda code to import dev-deps (since they are only needed during bundling)
  project.eslint?.allowDevDeps('src/**/*.lambda.ts');
  // Allow .lambda-shared code to import dev-deps (these are not entry points, but are shared by several lambdas)
  project.eslint?.allowDevDeps('src/**/*.lambda-shared.ts');
  for (const entry of glob.sync('src/**/*.lambda.ts')) {
    const trigger = basename(entry).startsWith('trigger.');
    newLambdaHandler(project, entry, trigger);
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
