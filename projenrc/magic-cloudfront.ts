import { basename, join, relative } from 'node:path';
import * as glob from 'glob';
import { TypeScriptProject } from 'projen/lib/typescript';

/**
 * Auto-discovers CloudFront Function handlers (`src/webapp/**&#47;*-function.ts`)
 * and bundles each of them with esbuild into the corresponding
 * `lib/webapp/.../*-function.js` file.
 *
 * The bundle overwrites the output emitted by the TypeScript compiler for the
 * same file: the compiled artifact is inlined verbatim into an
 * `AWS::CloudFront::Function` resource (via `FunctionCode.fromFile`), so it
 * must be valid CloudFront Functions runtime source — plain `tsc` output may
 * contain a CommonJS prologue that crashes the function at the edge.
 */
export function discoverCloudFrontFunctions(project: TypeScriptProject) {
  for (const entry of glob.sync(`${project.srcdir}/webapp/**/*-function.ts`)) {
    newCloudFrontFunction(project, entry);
  }
}

function newCloudFrontFunction(project: TypeScriptProject, entrypoint: string) {
  const base = basename(entrypoint, '.ts');
  const outfile = join(
    project.libdir,
    relative(project.srcdir, entrypoint)
  ).replace(/\.ts$/, '.js');

  const bundle = project.addTask(`bundle:${base}`, {
    description: `Create a CloudFront Function bundle from ${entrypoint}`,
    exec: [
      'ts-node',
      join('projenrc', 'bundle-cloudfront-function.exec.ts'),
      entrypoint,
      outfile,
      '--runtime=2.0',
    ].join(' '),
  });

  // Spawned at the end of the compile task, so the bundle replaces the
  // artifact emitted by the TypeScript compiler for the same source file.
  project.compileTask.spawn(bundle);
  project.tasks.tryFind('bundle')?.spawn(bundle);

  console.error(`${base}: cloudfront function bundle task "${bundle.name}"`);
}
