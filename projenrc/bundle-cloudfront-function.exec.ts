/**
 * Bundles a CloudFront Function handler written in TypeScript into plain
 * JavaScript that is valid in the restricted CloudFront Functions runtime.
 *
 * The output of this script is inlined verbatim into an
 * `AWS::CloudFront::Function` resource, so it must not contain any module
 * system artifacts (`exports`, `require()`, `export` statements). A plain
 * `tsc` emit does NOT guarantee this: depending on the tsconfig, it may
 * prepend a CommonJS prologue like
 * `Object.defineProperty(exports, "__esModule", { value: true });`, which
 * throws a `ReferenceError` in the CloudFront Functions runtime and takes
 * down the entire distribution with 503s.
 *
 * The esbuild configuration mirrors the one used by mrgrain/cdk-esbuild:
 * https://github.com/mrgrain/cdk-esbuild/blob/7ab7f28b8d6b74299de1bfa6b2752315a1b1a7d8/src/cloudfront-function-code.ts#L98
 */
import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';

/**
 * Language features supported by the CloudFront Functions runtimes.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-javascript-runtime-20.html
 */
function supportedFeatures(runtime: string): Record<string, boolean> {
  const isV2 = runtime === '2.0';
  return {
    'const-and-let': isV2,
    'exponent-operator': true,
    'template-literal': true,
    arrow: true,
    'rest-argument': true,
    'regexp-named-capture-groups': true,
    'async-await': isV2,
  };
}

async function main({
  positionals,
  values,
}: {
  positionals: string[];
  values: { runtime: string };
}) {
  const [entrypoint, outfile] = positionals;
  if (!entrypoint || !outfile) {
    throw new Error(
      'Usage: bundle-cloudfront-function.exec.ts <ENTRYPOINT> <OUTFILE> [--runtime=1.0|2.0]'
    );
  }
  if (!['1.0', '2.0'].includes(values.runtime)) {
    throw new Error(
      `Unsupported --runtime, expected "1.0" or "2.0", got: ${values.runtime}`
    );
  }

  await esbuild.build({
    entryPoints: [entrypoint],
    outfile,
    bundle: true,
    // `esm` does not emit a module prologue (unlike `cjs`), and the handler
    // must remain a top-level function declaration (`iife` would hide it).
    format: 'esm',
    target: 'es5',
    platform: 'neutral',
    // required because the handler function is never exported, and `export`
    // keywords are not allowed in the final code
    treeShaking: false,
    // provided by the CloudFront Functions runtime (e.g. key-value store)
    external: ['cloudfront'],
    legalComments: 'none',
    supported: supportedFeatures(values.runtime),
    logLevel: 'error',
  });

  validateCloudFrontFunctionCode(fs.readFileSync(outfile, 'utf-8'), entrypoint);
  console.log(`${outfile} (cloudfront-js-${values.runtime})`);
}

/**
 * Guards against module system artifacts leaking into the bundled code, which
 * would make it invalid in the CloudFront Functions runtime.
 */
function validateCloudFrontFunctionCode(code: string, entrypoint: string) {
  const forbidden: Array<[string, RegExp]> = [
    // e.g. `Object.defineProperty(exports, ...)`, `exports.foo`, `module.exports`
    ['a CommonJS "exports" reference', /\bexports\b/],
    ['a "require()" call', /\brequire\s*\(/],
    [
      'an ES module "export" statement',
      /\bexport\s*[{(]|\bexport\s+(function|const|let|var|default|class|async)/,
    ],
    // `import ... from 'cloudfront'` is provided by the runtime and allowed
    ['an "import" statement', /^\s*import\b(?!.*from\s*["']cloudfront["'])/m],
  ];

  for (const [description, pattern] of forbidden) {
    if (pattern.test(code)) {
      throw new Error(
        `Bundle built from '${entrypoint}' contains ${description}, which is invalid in the CloudFront Functions runtime.`
      );
    }
  }

  if (!/\bfunction handler\s*\(/.test(code)) {
    throw new Error(
      `Bundle built from '${entrypoint}' does not contain a top-level 'function handler(...)' declaration.`
    );
  }
}

main(
  parseArgs({
    allowPositionals: true,
    options: {
      runtime: { type: 'string', default: '2.0' },
    },
  })
).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
