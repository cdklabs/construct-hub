import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import { DenyListRule } from '../../../backend/deny-list/api';
import { DenyListClient } from '../../../backend/deny-list/client.lambda-shared';
import { ENV_DENY_LIST_BUCKET_NAME, ENV_DENY_LIST_OBJECT_KEY } from '../../../backend/deny-list/constants';
import * as aws from '../../../backend/shared/aws.lambda-shared';

const sample: Record<string, DenyListRule> = {
  'foo/v1.2.3': {
    packageName: 'foo',
    version: '1.2.3',
    reason: 'bar',
  },
  'bar': {
    packageName: 'bar',
    reason: 'hello bar',
  },
};

beforeEach(() => {
  process.env[ENV_DENY_LIST_BUCKET_NAME] = 'deny-list-bucket-name';
  process.env[ENV_DENY_LIST_OBJECT_KEY] = 'deny-list.json';
  AWSMock.setSDKInstance(AWS);
});

afterEach(() => {
  delete process.env[ENV_DENY_LIST_BUCKET_NAME];
  delete process.env[ENV_DENY_LIST_OBJECT_KEY];
  AWSMock.restore();
  aws.reset();
});

test('s3 object not found error', async () => {
  AWSMock.mock('S3', 'getObject', (_, callback) => {
    const err = new Error('NoSuchKey');
    (err as any).code = 'NoSuchKey';
    callback(err, null);
  });

  const client = await DenyListClient.newClient();
  expect(client.lookup('foo', '1.2.3')).toBeUndefined();
});

test('s3 bucket not found error', async () => {
  AWSMock.mock('S3', 'getObject', (_, callback) => {
    const err = new Error('NoSuchBucket');
    (err as any).code = 'NoSuchBucket';
    callback(err, null);
  });

  const client = await DenyListClient.newClient();
  expect(client.lookup('foo', '1.2.3')).toBeUndefined();
});

test('empty file', async () => {
  AWSMock.mock('S3', 'getObject', (params, callback) => {
    expect(params.Bucket).toBe('deny-list-bucket-name');
    expect(params.Key).toBe('deny-list.json');
    callback(null, { Body: '' });
  });

  const client = await DenyListClient.newClient();
  expect(client.lookup('foo', '1.2.3')).toBeUndefined();
});

test('json parsing error', async () => {
  AWSMock.mock('S3', 'getObject', (params, callback) => {
    expect(params.Bucket).toBe('deny-list-bucket-name');
    expect(params.Key).toBe('deny-list.json');
    callback(null, { Body: '09x{}' });
  });

  const expected = new Error('Unable to parse deny list file deny-list-bucket-name/deny-list.json: SyntaxError: Unexpected number in JSON at position 1');
  await expect(DenyListClient.newClient()).rejects.toEqual(expected);
});

describe('lookup', () => {
  let client: DenyListClient;

  beforeEach(async () => {
    AWSMock.mock('S3', 'getObject', (params, callback) => {
      expect(params.Bucket).toBe('deny-list-bucket-name');
      expect(params.Key).toBe('deny-list.json');
      callback(null, { Body: JSON.stringify(sample) });
    });

    client = await DenyListClient.newClient();
  });

  test('match specific package + version', () => {
    expect(client.lookup('foo', '1.2.3')).toStrictEqual({
      packageName: 'foo',
      version: '1.2.3',
      reason: 'bar',
    });
  });

  test('match any version', () => {
    const expected = {
      packageName: 'bar',
      reason: 'hello bar',
    };

    expect(client.lookup('bar', '1.2.3')).toStrictEqual(expected);
    expect(client.lookup('bar', '4.4.4')).toStrictEqual(expected);
  });

  test('version does not match', () => {
    expect(client.lookup('foo', '4.4.4')).toBeUndefined();
  });
});
