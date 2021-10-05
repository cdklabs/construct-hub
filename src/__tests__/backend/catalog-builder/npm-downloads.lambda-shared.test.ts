import type { Got } from 'got';
import { NpmDownloadsClient, NpmDownloadsPeriod } from '../../../backend/catalog-builder/npm-downloads.lambda-shared';

jest.mock('got');

const sampleData = {
  'npm': {
    downloads: 12345,
    package: 'npm',
    start: 'start-date',
    end: 'end-date',
  },
  'express': {
    downloads: 23456,
    package: 'express',
    start: 'start-date',
    end: 'end-date',
  },
  'react': {
    downloads: 34567,
    package: 'react',
    start: 'start-date',
    end: 'end-date',
  },
  '@aws-cdk/core': {
    downloads: 45678,
    package: '@aws-cdk/core',
    start: 'start-date',
    end: 'end-date',
  },
  '@aws-cdk/aws-s3': {
    downloads: 56789,
    package: '@aws-cdk/aws-s3',
    start: 'start-date',
    end: 'end-date',
  },
};

describe('getNpmDownloads', () => {
  test('gets the total downloads of a package for the last day', async () => {
    // GIVEN
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fakeGot = require('got') as jest.MockedFunction<Got>;
    fakeGot.mockImplementation(() => ({ body: JSON.stringify(sampleData.npm) }) as any);
    const client = new NpmDownloadsClient(fakeGot);

    // WHEN
    const output = await client.getDownloads(['npm'], { period: NpmDownloadsPeriod.LAST_DAY });

    // THEN
    expect(output).toEqual({ npm: sampleData.npm });
    expect(fakeGot).lastCalledWith(
      `${NpmDownloadsClient.NPM_DOWNLOADS_API_URL}/last-day/npm`,
      expect.anything(),
    );
  });

  test('gets the total downloads of a package for the last week', async () => {
    // GIVEN
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fakeGot = require('got') as jest.MockedFunction<Got>;
    fakeGot.mockImplementation(() => ({ body: JSON.stringify(sampleData.npm) }) as any);
    const client = new NpmDownloadsClient(fakeGot);

    // WHEN
    const output = await client.getDownloads(['npm'], { period: NpmDownloadsPeriod.LAST_WEEK });

    // THEN
    expect(output).toEqual({ npm: sampleData.npm });
    expect(fakeGot).lastCalledWith(
      `${NpmDownloadsClient.NPM_DOWNLOADS_API_URL}/last-week/npm`,
      expect.anything(),
    );
  });

  test('gets the total downloads of a package for the last month', async () => {
    // GIVEN
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fakeGot = require('got') as jest.MockedFunction<Got>;
    fakeGot.mockImplementation(() => ({ body: JSON.stringify(sampleData.npm) }) as any);
    const client = new NpmDownloadsClient(fakeGot);

    // WHEN
    const output = await client.getDownloads(['npm'], { period: NpmDownloadsPeriod.LAST_MONTH });

    // THEN
    expect(output).toEqual({ npm: sampleData.npm });
    expect(fakeGot).lastCalledWith(
      `${NpmDownloadsClient.NPM_DOWNLOADS_API_URL}/last-month/npm`,
      expect.anything(),
    );
  });

  test('requests scoped packages in individual queries', async () => {
    // GIVEN
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fakeGot = require('got') as jest.MockedFunction<Got>;
    fakeGot.mockImplementation(((url: string) => {
      if (url.endsWith('/last-week/@aws-cdk/core')) {
        return { body: JSON.stringify(sampleData['@aws-cdk/core']) };
      } else if (url.endsWith('/last-week/@aws-cdk/aws-s3')) {
        return { body: JSON.stringify(sampleData['@aws-cdk/aws-s3']) };
      } else if (url.endsWith('/last-week/npm,express,react')) {
        return {
          body: JSON.stringify({
            npm: sampleData.npm,
            express: sampleData.express,
            react: sampleData.react,
          }),
        };
      } else {
        throw new Error(`unexpected url: ${url}`);
      }
    }) as any);
    const client = new NpmDownloadsClient(fakeGot);

    // WHEN
    const output = await client.getDownloads(['npm', 'express', 'react', '@aws-cdk/core', '@aws-cdk/aws-s3']);

    // THEN
    expect(output).toEqual({
      '@aws-cdk/core': sampleData['@aws-cdk/core'],
      '@aws-cdk/aws-s3': sampleData['@aws-cdk/aws-s3'],
      'npm': sampleData.npm,
      'express': sampleData.express,
      'react': sampleData.react,
    });
  });

  test('batches packages into bulk queries', async () => {
    // GIVEN
    const numUnscopedPackages = NpmDownloadsClient.MAX_PACKAGES_PER_QUERY + 5;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fakeGot = require('got') as jest.MockedFunction<Got>;
    fakeGot.mockImplementation(((url: string) => {
      if (url.endsWith('/last-week/' + Array(128).fill('express').join(','))) {
        return { body: JSON.stringify(sampleData.express) };
      } else if (url.endsWith('/last-week/' + Array(5).fill('express').join(','))) {
        return { body: JSON.stringify(sampleData.express) };
      } else if (url.endsWith('/last-week/@aws-cdk/core')) {
        return { body: JSON.stringify(sampleData['@aws-cdk/core']) };
      } else {
        throw new Error(`unexpected url: ${url}`);
      }
    }) as any);
    const client = new NpmDownloadsClient(fakeGot);

    // WHEN
    const packages = Array(numUnscopedPackages).fill('express');
    packages.push(...Array(5).fill('@aws-cdk/core'));
    const output = await client.getDownloads(packages);

    // THEN
    expect(output).toEqual({
      '@aws-cdk/core': sampleData['@aws-cdk/core'],
      'express': sampleData.express,
    });
    // called twice to bulk query the 128 + 5 unscoped packages,
    // and five times to query each scoped package
    expect(fakeGot).toHaveBeenCalledTimes(7);
  });

  test('throws an error if package download count isn\'t available for one package', async () => {
    // GIVEN
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fakeGot = require('got') as jest.MockedFunction<Got>;
    fakeGot.mockImplementation(() => ({ body: JSON.stringify({ error: 'package invalid-pkg not found' }) }) as any);
    const client = new NpmDownloadsClient(fakeGot);

    // THEN
    return expect(client.getDownloads(['invalid-pkg'])).rejects.toThrowError(/Could not retrieve download metrics/);
  });

  test('throws an error if package download count isn\'t available for multiple packages', async () => {
    // GIVEN
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fakeGot = require('got') as jest.MockedFunction<Got>;
    fakeGot.mockImplementation(() => ({ body: JSON.stringify({ 'npm': sampleData.npm, 'invalid-pkg': null }) }) as any);
    const client = new NpmDownloadsClient(fakeGot);

    // THEN
    return expect(client.getDownloads(['npm', 'invalid-pkg'])).rejects.toThrowError(/Could not retrieve download metrics/);
  });
});
