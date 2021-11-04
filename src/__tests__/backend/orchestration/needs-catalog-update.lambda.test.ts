import { CatalogClient } from '../../../backend/catalog-builder/client.lambda-shared';
import { handler, Input } from '../../../backend/orchestration/needs-catalog-update.lambda';
import { STORAGE_KEY_PREFIX, PACKAGE_KEY_SUFFIX } from '../../../backend/shared/constants';

const mockNewClient = jest.spyOn(CatalogClient, 'newClient');
mockNewClient.mockReturnValue(Promise.resolve({
  packages: [
    // Omitting fields that are not relevant to this test.
    { name: '@dummy/existing-package', major: 1, version: '1.2.3' } as any,
    { name: '@dummy/existing-package', major: 2, version: '2.3.4' } as any,
  ],
}));

test('input is broken', () => {
  const event: Input = { package: { key: 'not-a-valid-key' } };

  return expect(handler(event)).rejects.toThrow(/not-a-valid-key/);
});


test('package version is new', () => {
  const packageName = '@dummy/new-package';
  const packageVersion = '42.1337.0';

  const key = `${STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${PACKAGE_KEY_SUFFIX}`;
  const event: Input = { package: { key } };

  return expect(handler(event)).resolves.toBeTruthy();
});

test('package version is new major', () => {
  const packageName = '@dummy/existing-package';
  const packageVersion = '3.0.0-pre.0';

  const key = `${STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${PACKAGE_KEY_SUFFIX}`;
  const event: Input = { package: { key } };

  return expect(handler(event)).resolves.toBeTruthy();
});

test('package version is the same as current', () => {
  const packageName = '@dummy/existing-package';
  const packageVersion = '1.2.3';

  const key = `${STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${PACKAGE_KEY_SUFFIX}`;
  const event: Input = { package: { key } };

  return expect(handler(event)).resolves.toBeTruthy();
});

test('package version is newer than current', () => {
  const packageName = '@dummy/existing-package';
  const packageVersion = '1.2.4-pre.0';

  const key = `${STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${PACKAGE_KEY_SUFFIX}`;
  const event: Input = { package: { key } };

  return expect(handler(event)).resolves.toBeTruthy();
});

test('package version is older than current', () => {
  const packageName = '@dummy/existing-package';
  const packageVersion = '2.3.4-pre.0';

  const key = `${STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${PACKAGE_KEY_SUFFIX}`;
  const event: Input = { package: { key } };

  return expect(handler(event)).resolves.toBeFalsy();
});
