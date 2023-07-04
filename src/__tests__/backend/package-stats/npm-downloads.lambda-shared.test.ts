import type { Got } from 'got';
import {
  NpmDownloadsClient,
  NpmDownloadsPeriod,
} from '../../../backend/package-stats/npm-downloads.lambda-shared';

jest.mock('got');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fakeGot = require('got') as jest.MockedFunction<Got>;
beforeEach(() => {
  fakeGot.mockReset();
});
afterAll(() => {
  fakeGot.mockRestore();
});

const sampleData = {
  npm: {
    downloads: 12345,
    package: 'npm',
    start: '2021-10-10',
    end: '2021-10-10',
  },
  express: {
    downloads: 23456,
    package: 'express',
    start: '2021-10-10',
    end: '2021-10-10',
  },
  react: {
    downloads: 34567,
    package: 'react',
    start: '2021-10-10',
    end: '2021-10-10',
  },
  '@aws-cdk/core': {
    downloads: 45678,
    package: '@aws-cdk/core',
    start: '2021-10-10',
    end: '2021-10-10',
  },
  '@aws-cdk/aws-s3': {
    downloads: 56789,
    package: '@aws-cdk/aws-s3',
    start: '2021-10-10',
    end: '2021-10-10',
  },
};

describe('getNpmDownloads', () => {
  test.each([
    NpmDownloadsPeriod.LAST_DAY,
    NpmDownloadsPeriod.LAST_WEEK,
    NpmDownloadsPeriod.LAST_MONTH,
  ])('gets the total downloads of a package for the %s', async (period) => {
    // GIVEN
    fakeGot.mockImplementation((url: any) => {
      expect(url).toEqual(
        `${NpmDownloadsClient.NPM_DOWNLOADS_API_URL}/${period.toString()}/npm`
      );
      return Promise.resolve({ body: JSON.stringify(sampleData.npm) }) as any;
    });
    const client = new NpmDownloadsClient(fakeGot);

    // WHEN
    const output = await client.getDownloads(['npm'], { period });

    // THEN
    expect(Object.fromEntries(output)).toEqual({ npm: sampleData.npm });
  });

  test('makes individual queries for scoped packages', async () => {
    // GIVEN
    fakeGot.mockImplementation(((url: string) => {
      if (url.endsWith('/last-week/@aws-cdk/core')) {
        return Promise.resolve({
          body: JSON.stringify(sampleData['@aws-cdk/core']),
        });
      } else if (url.endsWith('/last-week/@aws-cdk/aws-s3')) {
        return Promise.resolve({
          body: JSON.stringify(sampleData['@aws-cdk/aws-s3']),
        });
      } else if (url.endsWith('/last-week/npm,express,react')) {
        return Promise.resolve({
          body: JSON.stringify({
            npm: sampleData.npm,
            express: sampleData.express,
            react: sampleData.react,
          }),
        });
      } else {
        return Promise.reject(new Error(`unexpected url: ${url}`));
      }
    }) as any);
    const client = new NpmDownloadsClient(fakeGot);

    // WHEN
    const output = await client.getDownloads([
      'npm',
      'express',
      'react',
      '@aws-cdk/core',
      '@aws-cdk/aws-s3',
    ]);

    // THEN
    expect(Object.fromEntries(output)).toEqual({
      '@aws-cdk/core': sampleData['@aws-cdk/core'],
      '@aws-cdk/aws-s3': sampleData['@aws-cdk/aws-s3'],
      npm: sampleData.npm,
      express: sampleData.express,
      react: sampleData.react,
    });
  });

  test('batches unscoped packages into bulk queries', async () => {
    // GIVEN
    const numUnscopedPackages = NpmDownloadsClient.MAX_PACKAGES_PER_QUERY + 5;
    fakeGot.mockImplementation(((url: string) => {
      if (url.endsWith('/last-week/' + Array(128).fill('express').join(','))) {
        return Promise.resolve({ body: JSON.stringify(sampleData.express) });
      } else if (
        url.endsWith('/last-week/' + Array(5).fill('express').join(','))
      ) {
        return Promise.resolve({ body: JSON.stringify(sampleData.express) });
      } else if (url.endsWith('/last-week/@aws-cdk/core')) {
        return Promise.resolve({
          body: JSON.stringify(sampleData['@aws-cdk/core']),
        });
      } else {
        return Promise.reject(new Error(`unexpected url: ${url}`));
      }
    }) as any);
    const client = new NpmDownloadsClient(fakeGot);

    // WHEN
    const packages = Array(numUnscopedPackages).fill('express');
    packages.push(...Array(5).fill('@aws-cdk/core'));
    const output = await client.getDownloads(packages);

    // THEN
    expect(Object.fromEntries(output)).toEqual({
      '@aws-cdk/core': sampleData['@aws-cdk/core'],
      express: sampleData.express,
    });
    // called twice to bulk query the 128 + 5 unscoped packages,
    // and five times to query each scoped package
    expect(fakeGot).toHaveBeenCalledTimes(7);
  });

  test("throws an error if package download count isn't available for one package", async () => {
    // GIVEN
    fakeGot.mockReturnValueOnce(
      Promise.resolve({
        body: JSON.stringify({ error: 'package invalid-pkg not found' }),
      }) as any
    );
    const client = new NpmDownloadsClient(fakeGot);

    // THEN
    return expect(client.getDownloads(['invalid-pkg'])).rejects.toThrowError(
      /Could not retrieve download metrics/
    );
  });

  test("throws an error if package download count isn't available for multiple packages", async () => {
    // GIVEN
    fakeGot.mockReturnValueOnce(
      Promise.resolve({
        body: JSON.stringify({ npm: sampleData.npm, 'invalid-pkg': null }),
      }) as any
    );
    const client = new NpmDownloadsClient(fakeGot);

    // THEN
    return expect(
      client.getDownloads(['npm', 'invalid-pkg'])
    ).rejects.toThrowError(/Could not retrieve download metrics/);
  });

  test('does not throw errors if throwErrors is disabled', async () => {
    // GIVEN
    fakeGot.mockReturnValueOnce(
      Promise.resolve({
        body: JSON.stringify({ error: 'package invalid-pkg not found' }),
      }) as any
    );
    const client = new NpmDownloadsClient(fakeGot);

    // WHEN
    const output = await client.getDownloads(['invalid-pkg'], {
      throwErrors: false,
    });

    // THEN
    return expect(output.size).toEqual(0);
  });
});
