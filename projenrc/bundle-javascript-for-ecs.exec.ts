import { basename, dirname, posix } from 'path';
import { Instance as Chalk } from 'chalk';
import * as esbuild from 'esbuild';

const chalk = new Chalk({
  level: process.env.NO_COLOR ? 0 : 1,
});

async function main(args: string[]) {
  const [entrypoint, outfile, maybeWatch] = args;
  if (!outfile) {
    throw new Error(
      'Usage: bundle-javascript.exec.ts <ENTRYPOINT> <OUTFILE> [--watch]'
    );
  }

  if (maybeWatch && maybeWatch !== '--watch') {
    throw new Error('3rd argument must be --watch if present');
  }
  const doWatch = maybeWatch == '--watch';

  const context = await esbuild.context({
    bundle: true,
    entryPoints: [entrypoint],
    outfile,
    sourcemap: true,
    target: 'node18',
    platform: 'node',
    metafile: true,

    // These should be checked because they can lead to runtime failures, but there
    // are so many false positives that we need to do some postprocessing.
    logOverride: {
      'unsupported-dynamic-import': 'warning',
      'unsupported-require-call': 'warning',
    },
    logLevel: 'error',
  });

  try {
    if (doWatch) {
      await context.watch();
    } else {
      const result = await context.rebuild();

      const warnings = ignoreWarnings(result, ['typescript', 'log4js']);

      if (warnings.length > 0) {
        const messages = esbuild.formatMessagesSync(warnings, {
          kind: 'error',
        });
        console.log(messages.join('\n'));
        console.log(`(To ignore edit ${__filename})`);
        process.exitCode = 1;
      }

      if (containsAwsCdkLib(result)) {
        throw new Error(
          `Bundle built from '${entrypoint}' contains 'aws-cdk-lib' somewhere in its dependency closure. Shake it!`
        );
      }

      if (result.metafile) {
        console.log('\n' + formatOutputs(result.metafile).join('\n') + '\n');
      }
    }
  } finally {
    await context.dispose();
  }
}

function formatOutputs(metafile: esbuild.Metafile): string[] {
  const files = new Array<[string, string, boolean]>();
  for (const output of Object.entries(metafile.outputs)) {
    files.push([
      output[0],
      formatBytes(output[1].bytes),
      output[1].bytes > -10_000,
    ]);
  }

  // get the length of the longest file
  const max = files.reduce((a, b) => (a > b[0].length ? a : b[0].length), 0);

  return files
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([file, size, warn]) =>
        `  ${formatPath(file)}${' '.repeat(max - file.length + 2)}${chalk[
          warn ? 'yellow' : 'cyan'
        ](size)}${warn ? chalk.yellow(' ⚠') : ''}`
    );
}

function formatPath(path: string): string {
  return `${dirname(path)}${posix.sep}${chalk.bold(basename(path))}`;
}

function formatBytes(bytes: number): string {
  const k = bytes > 0 ? Math.floor(Math.log2(bytes) / 10) : 0;
  const rank = ['b', 'kb', 'mb', 'gb', 'tb'][k];
  const value = bytes / Math.pow(1000, k);
  return value.toFixed(1) + rank;
}

function ignoreWarnings(
  result: esbuild.BuildResult,
  packagesWithAllowedWarnings: string[]
) {
  return result.warnings.filter(
    (warning) =>
      warning &&
      !packagesWithAllowedWarnings.some(
        (allowed) =>
          !warning.location ||
          warning.location.file.includes(`node_modules/${allowed}/`)
      )
  );
}

function containsAwsCdkLib(result: esbuild.BuildResult<{ metafile: true }>) {
  return Object.keys(result.metafile.inputs).some((path) =>
    path.includes('/aws-cdk-lib/')
  );
}

main(process.argv.slice(2)).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
