import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import { DenyListRule, DENY_LIST_BUCKET_NAME_ENV, DENY_LIST_OBJECT_KEY_ENV } from '../../../backend/deny-list/api';
import { DenyListClient } from '../../../backend/deny-list/client.lambda-shared';

const sample: Record<string, DenyListRule> = {
  'foo@1.2.3': {
    package: 'foo',
    version: '1.2.3',
    reason: 'bar',
  },
  'bar': {
    package: 'bar',
    reason: 'hello bar',
  },
};

beforeEach(() => {
  process.env[DENY_LIST_BUCKET_NAME_ENV] = 'deny-list-bucket-name';
  process.env[DENY_LIST_OBJECT_KEY_ENV] = 'deny-list.json';
  AWSMock.setSDKInstance(AWS);
});

afterEach(() => {
  AWSMock.restore();
});

test('lookup() fails if not initialized', () => {
  const client = new DenyListClient();
  expect(() => client.lookup('foo', '1.2.3')).toThrow(/init/);
});

test('s3 object not found error', async () => {
  AWSMock.mock('S3', 'getObject', (_, callback) => {
    callback(new Error('not found'), null);
  });

  const client = new DenyListClient();
  await client.init();
  expect(client.lookup('foo', '1.2.3')).toBeUndefined();
});

test('empty file', async () => {
  AWSMock.mock('S3', 'getObject', (params, callback) => {
    expect(params.Bucket).toBe('deny-list-bucket-name');
    expect(params.Key).toBe('deny-list.json');
    callback(null, { Body: '' });
  });

  const client = new DenyListClient();
  await client.init();
  expect(client.lookup('foo', '1.2.3')).toBeUndefined();
});

test('json parsing error', async () => {
  AWSMock.mock('S3', 'getObject', (params, callback) => {
    expect(params.Bucket).toBe('deny-list-bucket-name');
    expect(params.Key).toBe('deny-list.json');
    callback(null, { Body: '09x{}' });
  });

  const client = new DenyListClient();
  await client.init();
  expect(client.lookup('foo', '1.2.3')).toBeUndefined();
});

describe('lookup', () => {
  let client: DenyListClient;

  beforeEach(async () => {
    AWSMock.mock('S3', 'getObject', (params, callback) => {
      expect(params.Bucket).toBe('deny-list-bucket-name');
      expect(params.Key).toBe('deny-list.json');
      callback(null, { Body: JSON.stringify(sample) });
    });

    client = new DenyListClient();
    await client.init();
  });

  test('match specific package + version', () => {
    expect(client.lookup('foo', '1.2.3')).toStrictEqual({
      package: 'foo',
      version: '1.2.3',
      reason: 'bar',
    });
  });

  test('match any version', () => {
    const expected = {
      package: 'bar',
      reason: 'hello bar',
    };

    expect(client.lookup('bar', '1.2.3')).toStrictEqual(expected);
    expect(client.lookup('bar', '4.4.4')).toStrictEqual(expected);
  });

  test('version does not match', () => {
    expect(client.lookup('foo', '4.4.4')).toBeUndefined();
  });
});

test('init() downloads the file every time', async () => {
  AWSMock.mock('S3', 'getObject', (_, callback) => callback(null, { Body: JSON.stringify(sample) }));

  const client = new DenyListClient();
  await client.init();
  expect(client.lookup('foo', '1.2.3')).toStrictEqual({
    package: 'foo',
    version: '1.2.3',
    reason: 'bar',
  });

  AWSMock.remock('S3', 'getObject', (_, callback) => callback(null, { Body: JSON.stringify({}) }));
  await client.init();
  expect(client.lookup('foo', '1.2.3')).toBeUndefined();
});
