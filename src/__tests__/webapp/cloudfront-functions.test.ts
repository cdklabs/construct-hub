import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

/**
 * Regression test for https://github.com/cdklabs/construct-hub/issues (v0.4.515):
 *
 * The compiled CloudFront Function files are inlined verbatim into
 * `AWS::CloudFront::Function` resources. The CloudFront Functions runtime is a
 * heavily restricted JavaScript environment with no module system: a CommonJS
 * prologue like `Object.defineProperty(exports, "__esModule", { value: true })`
 * throws a `ReferenceError` at the edge and turns every request into a 503.
 *
 * These tests load the bundled artifacts (as shipped in `lib/`) into a bare
 * sandbox that — like the CloudFront runtime — provides no `exports`,
 * `module`, or `require`, and invoke the handler.
 */
const cloudFrontFunctions = [
  {
    name: 'response-function',
    file: path.join(
      __dirname,
      '..',
      '..',
      'webapp',
      'response-function',
      'response-function.js'
    ),
    event: { response: { headers: {} } },
  },
  {
    name: 'badge-redirect-function',
    file: path.join(
      __dirname,
      '..',
      '..',
      'webapp',
      'badge-redirect-function',
      'redirect-function.js'
    ),
    event: { request: {} },
  },
];

describe.each(cloudFrontFunctions)(
  '$name is valid CloudFront Functions code',
  ({ file, event }) => {
    const code = fs.readFileSync(file, 'utf-8');

    test('does not contain module system artifacts', () => {
      // e.g. `Object.defineProperty(exports, ...)`, `exports.foo = ...`
      expect(code).not.toMatch(/\bexports\b/);
      expect(code).not.toMatch(/\bmodule\.exports\b/);
      expect(code).not.toMatch(/\brequire\s*\(/);
      expect(code).not.toMatch(
        /\bexport\s*[{(]|\bexport\s+(function|const|let|var|default|class|async)/
      );
      expect(code).not.toMatch(/^\s*import\b/m);
    });

    test('declares a top-level handler function', () => {
      expect(code).toMatch(/\bfunction handler\s*\(/);
    });

    test('evaluates and runs in a bare sandbox without module globals', () => {
      // no `exports`, `module`, `require`, ... — same as the CloudFront runtime
      const sandbox: any = {};
      expect(() =>
        vm.runInNewContext(code, sandbox, { filename: file })
      ).not.toThrow();

      expect(typeof sandbox.handler).toBe('function');
      expect(sandbox.handler(event)).toBeDefined();
    });
  }
);

test('response-function handler adds security headers', () => {
  const code = fs.readFileSync(cloudFrontFunctions[0].file, 'utf-8');
  const sandbox: any = {};
  vm.runInNewContext(code, sandbox);

  const response = sandbox.handler({ response: { headers: {} } });

  expect(response.headers['x-frame-options']).toEqual({ value: 'deny' });
  expect(response.headers['strict-transport-security']).toBeDefined();
  expect(response.headers['content-security-policy']).toBeDefined();
});

test('badge-redirect-function handler redirects to the dynamic badge', () => {
  const code = fs.readFileSync(cloudFrontFunctions[1].file, 'utf-8');
  const sandbox: any = {};
  vm.runInNewContext(code, sandbox);

  expect(sandbox.handler({ request: {} })).toEqual({
    statusCode: 302,
    statusDescription: 'Found',
    headers: { location: { value: '/badge-dynamic.svg' } },
  });
});
