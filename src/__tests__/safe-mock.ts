/* istanbul ignore file */

/**
 * Creates a value of the given type, from a partial value thereof. Attempting
 * to use a property that was not part of the partial value, and is not a
 * "standard" feature (such as toJSON, assymmetricMatch, ...) results in a test
 * failure.
 *
 * @param name the name of the mock object.
 * @param partial the partial value to base the mock object on.
 *
 * @returns a new mock instance of T.
 */
export function safeMock<T extends object>(
  mockName: string,
  partial: Partial<T>
): T {
  (partial as any)[MOCK_NAME] = mockName;
  return new Proxy<any>(partial, PROXY_HANDLER);
}

const MOCK_NAME = Symbol('$mock-name$');
const ALWAYS_PASS_THROUGH = new Set([
  'asymmetricMatch', // A jest property used to customize matching behavior.
  'then',
  'toJSON',
]);

const PROXY_HANDLER: ProxyHandler<any> = {
  get: (target: any, name: string | symbol) => {
    if (
      name in target ||
      typeof name !== 'string' ||
      ALWAYS_PASS_THROUGH.has(name)
    ) {
      return target[name];
    }
    // Throw if we try to use a property or method that was not mocked.
    throw new TypeError(
      `Attempted to use un-mocked property ${name} on ${target[MOCK_NAME]}`
    );
  },
};
