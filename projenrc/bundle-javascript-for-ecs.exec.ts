import * as esbuild from 'esbuild';

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
    target: 'node16',
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
    }
  } finally {
    await context.dispose();
  }
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
