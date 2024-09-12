import {
  GetObjectCommand,
  NoSuchBucket,
  NoSuchKey,
  S3Client,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import type { PackageInfo } from '../../../backend/catalog-builder';
import {
  CatalogClient,
  CatalogNotFoundError,
} from '../../../backend/catalog-builder/client.lambda-shared';
import { stringToStream } from '../../streams';

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

const mockS3 = mockClient(S3Client);

beforeEach(() => {
  process.env.CATALOG_BUCKET_NAME = 'catalog-bucket-name';
  process.env.CATALOG_OBJECT_KEY = 'catalog.json';
  mockS3.reset();
});

afterEach(() => {
  delete process.env.CATALOG_BUCKET_NAME;
  delete process.env.CATALOG_OBJECT_KEY;
});

test('s3 object not found error', async () => {
  mockS3.on(GetObjectCommand).rejects(
    new NoSuchKey({
      $metadata: {},
      message: 'The specified key does not exist.',
    })
  );

  const expected = new CatalogNotFoundError('catalog-bucket-name/catalog.json');
  return expect(async () => CatalogClient.newClient()).rejects.toEqual(
    expected
  );
});

test('s3 bucket not found error', async () => {
  mockS3.on(GetObjectCommand).rejects(
    new NoSuchBucket({
      $metadata: {},
      message: 'The specified bucket does not exist.',
    })
  );

  const expected = new CatalogNotFoundError('catalog-bucket-name/catalog.json');
  return expect(async () => CatalogClient.newClient()).rejects.toEqual(
    expected
  );
});

test('empty file', async () => {
  mockS3
    .on(GetObjectCommand, {
      Bucket: 'catalog-bucket-name',
      Key: 'catalog.json',
    })
    .resolves({
      Body: stringToStream(''),
    });

  const expected = new Error(
    'Catalog body is empty at catalog-bucket-name/catalog.json'
  );
  return expect(async () => CatalogClient.newClient()).rejects.toEqual(
    expected
  );
});

test('no body', async () => {
  mockS3
    .on(GetObjectCommand, {
      Bucket: 'catalog-bucket-name',
      Key: 'catalog.json',
    })
    .resolves({});

  const expected = new Error(
    'Catalog body is empty at catalog-bucket-name/catalog.json'
  );
  return expect(async () => CatalogClient.newClient()).rejects.toEqual(
    expected
  );
});

test('json parsing error', async () => {
  mockS3
    .on(GetObjectCommand, {
      Bucket: 'catalog-bucket-name',
      Key: 'catalog.json',
    })
    .resolves({ Body: stringToStream('09x{}') });

  const expected = new Error(
    'Unable to parse catalog file catalog-bucket-name/catalog.json: SyntaxError: Unexpected number in JSON at position 1'
  );
  return expect(async () => CatalogClient.newClient()).rejects.toEqual(
    expected
  );
});

test('happy path - get packages', async () => {
  mockS3
    .on(GetObjectCommand, {
      Bucket: 'catalog-bucket-name',
      Key: 'catalog.json',
    })
    .resolves({
      Body: stringToStream(JSON.stringify({ packages: samplePackages })),
    });

  const client = await CatalogClient.newClient();
  expect(client.packages).toStrictEqual(samplePackages);
});
