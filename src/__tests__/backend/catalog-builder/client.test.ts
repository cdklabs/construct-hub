import * as AWS from 'aws-sdk';
import { AWSError } from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import type { PackageInfo } from '../../../backend/catalog-builder';
import {
  CatalogClient,
  CatalogNotFoundError,
} from '../../../backend/catalog-builder/client.lambda-shared';
import * as aws from '../../../backend/shared/aws.lambda-shared';

const samplePackages: Partial<PackageInfo>[] = [
  {
    description: 'Package @scope/package, version 1.2.3',
    languages: { java: { foo: 'bar' } },
    major: 1,
    metadata: { date: 'Thu, 17 Jun 2021 01:52:04 GMT' },
    name: '@scope/package',
    version: '1.2.3',
  },
  {
    description: 'Package name, version 1.2.3',
    languages: { java: { foo: 'bar' } },
    major: 1,
    metadata: { date: 'Thu, 17 Jun 2021 01:52:04 GMT' },
    name: 'name',
    version: '1.2.3',
  },
  {
    description: 'Package name, version 2.0.0-pre',
    languages: { java: { foo: 'bar' } },
    major: 2,
    metadata: { date: 'Thu, 17 Jun 2021 01:52:04 GMT' },
    name: 'name',
    version: '2.0.0-pre',
  },
];

beforeEach(() => {
  process.env.CATALOG_BUCKET_NAME = 'catalog-bucket-name';
  process.env.CATALOG_OBJECT_KEY = 'catalog.json';
  AWSMock.setSDKInstance(AWS);
});

afterEach(() => {
  delete process.env.CATALOG_BUCKET_NAME;
  delete process.env.CATALOG_OBJECT_KEY;
  AWSMock.restore();
  aws.reset();
});

test('s3 object not found error', async () => {
  AWSMock.mock('S3', 'getObject', (_, callback) => {
    const err = new Error('NoSuchKey');
    (err as any).code = 'NoSuchKey';
    callback(err as AWSError, undefined);
  });

  const expected = new CatalogNotFoundError('catalog-bucket-name/catalog.json');
  return expect(async () => CatalogClient.newClient()).rejects.toEqual(
    expected
  );
});

test('s3 bucket not found error', async () => {
  AWSMock.mock('S3', 'getObject', (_, callback) => {
    const err = new Error('NoSuchBucket');
    (err as any).code = 'NoSuchBucket';
    callback(err as AWSError, undefined);
  });

  const expected = new CatalogNotFoundError('catalog-bucket-name/catalog.json');
  return expect(async () => CatalogClient.newClient()).rejects.toEqual(
    expected
  );
});

test('empty file', async () => {
  AWSMock.mock('S3', 'getObject', (params, callback) => {
    expect(params.Bucket).toBe('catalog-bucket-name');
    expect(params.Key).toBe('catalog.json');
    callback(undefined, { Body: '' });
  });

  const expected = new Error(
    'Catalog body is empty at catalog-bucket-name/catalog.json'
  );
  return expect(async () => CatalogClient.newClient()).rejects.toEqual(
    expected
  );
});

test('json parsing error', async () => {
  AWSMock.mock('S3', 'getObject', (params, callback) => {
    expect(params.Bucket).toBe('catalog-bucket-name');
    expect(params.Key).toBe('catalog.json');
    callback(undefined, { Body: '09x{}' });
  });

  const expected = new Error(
    'Unable to parse catalog file catalog-bucket-name/catalog.json: SyntaxError: Unexpected number in JSON at position 1'
  );
  return expect(async () => CatalogClient.newClient()).rejects.toEqual(
    expected
  );
});

test('happy path - get packages', async () => {
  AWSMock.mock('S3', 'getObject', (params, callback) => {
    expect(params.Bucket).toBe('catalog-bucket-name');
    expect(params.Key).toBe('catalog.json');
    callback(undefined, { Body: JSON.stringify({ packages: samplePackages }) });
  });

  const client = await CatalogClient.newClient();
  expect(client.packages).toStrictEqual(samplePackages);
});
