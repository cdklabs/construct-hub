import {
  GetObjectCommand,
  NoSuchBucket,
  NoSuchKey,
  S3Client,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { DenyListRule } from '../../../backend';
import { DenyListClient } from '../../../backend/deny-list/client.lambda-shared';
import {
  ENV_DENY_LIST_BUCKET_NAME,
  ENV_DENY_LIST_OBJECT_KEY,
} from '../../../backend/deny-list/constants';
import { stringToStream } from '../../streams';

const sample: Record<string, DenyListRule> = {
  'foo/v1.2.3': {
    packageName: 'foo',
    version: '1.2.3',
    reason: 'bar',
  },
  bar: {
    packageName: 'bar',
    reason: 'hello bar',
  },
};

beforeEach(() => {
  process.env[ENV_DENY_LIST_BUCKET_NAME] = 'deny-list-bucket-name';
  process.env[ENV_DENY_LIST_OBJECT_KEY] = 'deny-list.json';
});

afterEach(() => {
  delete process.env[ENV_DENY_LIST_BUCKET_NAME];
  delete process.env[ENV_DENY_LIST_OBJECT_KEY];
});

test('s3 object not found error', async () => {
  const s3Mock = mockClient(S3Client);

  s3Mock.on(GetObjectCommand).rejects(
    new NoSuchKey({
      message: 'The specified key does not exist.',
      $metadata: {
        httpStatusCode: 404,
      },
    })
  );

  const client = await DenyListClient.newClient();
  expect(client.lookup('foo', '1.2.3')).toBeUndefined();
});

test('s3 bucket not found error', async () => {
  const s3Mock = mockClient(S3Client);

  s3Mock.on(GetObjectCommand).rejects(
    new NoSuchBucket({
      message: 'The specified bucket does not exist.',
      $metadata: {
        httpStatusCode: 404,
      },
    })
  );

  const client = await DenyListClient.newClient();
  expect(client.lookup('foo', '1.2.3')).toBeUndefined();
});

test('s3 object is an empty file', async () => {
  const s3Mock = mockClient(S3Client);

  s3Mock.on(GetObjectCommand).resolves({
    Body: stringToStream(''),
  });

  const client = await DenyListClient.newClient();
  expect(client.lookup('foo', '1.2.3')).toBeUndefined();

  s3Mock.commandCalls(GetObjectCommand, {
    Bucket: 'deny-list-bucket-name',
    Key: 'deny-list.json',
  });
});

test('s3 object is not a valid json', async () => {
  const s3Mock = mockClient(S3Client);

  s3Mock.on(GetObjectCommand).resolves({
    Body: stringToStream('09x{}'),
  });

  const expected =
    'Unable to parse deny list file deny-list-bucket-name/deny-list.json: SyntaxError: Unexpected number in JSON at position 1';

  await expect(async () => DenyListClient.newClient()).rejects.toThrow(
    expected
  );
});

describe('lookup', () => {
  let s3Mock: any;
  let client: DenyListClient;

  beforeEach(async () => {
    s3Mock = mockClient(S3Client);
    s3Mock.on(GetObjectCommand).resolves({
      Body: stringToStream(JSON.stringify(sample)),
    });

    client = await DenyListClient.newClient();
  });

  afterEach(async () => {
    s3Mock.commandCalls(GetObjectCommand, {
      Bucket: 'deny-list-bucket-name',
      Key: 'deny-list.json',
    });
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
