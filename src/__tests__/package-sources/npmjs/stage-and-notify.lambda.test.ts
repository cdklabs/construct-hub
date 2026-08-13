import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import nock from 'nock';
import {
  ENV_DENY_LIST_BUCKET_NAME,
  ENV_DENY_LIST_OBJECT_KEY,
} from '../../../backend/deny-list/constants';
import { S3KeyPrefix } from '../../../package-sources/npmjs/constants.lambda-shared';
import {
  handler,
  NOT_FOUND_RETRY,
  PackageVersion,
} from '../../../package-sources/npmjs/stage-and-notify.lambda';
import { stringToStream } from '../../streams';

const MOCK_STAGING_BUCKET = 'foo';
const MOCK_QUEUE_URL = 'bar';
const MOCK_DENY_LIST_BUCKET = 'deny-list-bucket-name';
const MOCK_DENY_LIST_OBJECT = 'my-deny-list.json';

const mockS3 = mockClient(S3Client);
const mockSQS = mockClient(SQSClient);

beforeEach(() => {
  mockS3.reset();
  mockSQS.reset();
  process.env.BUCKET_NAME = MOCK_STAGING_BUCKET;
  process.env.QUEUE_URL = MOCK_QUEUE_URL;
  process.env[ENV_DENY_LIST_BUCKET_NAME] = MOCK_DENY_LIST_BUCKET;
  process.env[ENV_DENY_LIST_OBJECT_KEY] = MOCK_DENY_LIST_OBJECT;

  // empty deny list
  mockS3
    .on(GetObjectCommand, {
      Bucket: MOCK_DENY_LIST_BUCKET,
      Key: MOCK_DENY_LIST_OBJECT,
    })
    .resolves({
      Body: stringToStream(JSON.stringify({})),
    });

  // Keep the 404 retry loop fast in tests.
  NOT_FOUND_RETRY.baseDelayMs = 1;
  NOT_FOUND_RETRY.maxDelayMs = 5;
  NOT_FOUND_RETRY.deadlineMs = 100;
});

afterEach(() => {
  process.env.BUCKET_NAME = undefined;
  process.env.QUEUE_URL = undefined;
  delete process.env[ENV_DENY_LIST_BUCKET_NAME];
  delete process.env[ENV_DENY_LIST_OBJECT_KEY];
  nock.cleanAll();
});

test('happy path', async () => {
  const basePath = 'https://registry.npmjs.org';
  const uri = '@pepperize/cdk-vpc/-/cdk-vpc-0.0.785.tgz';
  const stagingKey = `${S3KeyPrefix.STAGED_KEY_PREFIX}${uri}`;
  const tarball = 'tarball';

  // registry response
  nock(basePath).get(`/${uri}`).reply(200, tarball);

  const event: PackageVersion = {
    tarballUrl: `${basePath}/${uri}`,
    integrity: '09d37ec93c5518bf4842ac8e381a5c06452500e5',
    modified: '2023-09-22T15:48:10.381Z',
    name: '@pepper/cdk-vpc',
    seq: '26437963',
    version: '0.0.785',
  };

  const context: Context = {
    logGroupName: 'group',
    logStreamName: 'stream',
    awsRequestId: 'request-id',
  } as any;

  await expect(handler(event, context)).resolves.toBe(undefined);

  expect(mockS3).toHaveReceivedCommandTimes(PutObjectCommand, 1);
  expect(mockS3).toHaveReceivedCommandWith(PutObjectCommand, {
    Bucket: MOCK_STAGING_BUCKET,
    Key: stagingKey,
    Body: Buffer.from(tarball),
    ContentType: 'application/octet-stream',
    Metadata: expect.anything(),
  });

  expect(mockSQS).toHaveReceivedCommandTimes(SendMessageCommand, 1);
  expect(mockSQS).toHaveReceivedCommandWith(SendMessageCommand, {
    MessageBody: JSON.stringify({
      tarballUri: `s3://${MOCK_STAGING_BUCKET}/${stagingKey}`,
      metadata: {
        dist: event.tarballUrl,
        integrity: event.integrity,
        modified: event.modified,
        seq: event.seq,
      },
      time: event.modified,
      integrity:
        'sha384-Ebfvd5xY6T7bTyV20TsEHDVZPrWk2boggPbYA7vTwum0xhDLIDx+tOU0wTcVUnHy',
    }),
    MessageAttributes: expect.anything(),
    QueueUrl: MOCK_QUEUE_URL,
  });
});

test('ignores persistent 404', async () => {
  const basePath = 'https://registry.npmjs.org';
  const uri = '/@pepperize/cdk-vpc/-/cdk-vpc-0.0.785.tgz';

  // registry response
  nock(basePath).get(uri).reply(404).persist();

  const event: PackageVersion = {
    tarballUrl: `${basePath}${uri}`,
    integrity: '09d37ec93c5518bf4842ac8e381a5c06452500e5',
    modified: '2023-09-22T15:48:10.381Z',
    name: '@pepper/cdk-vpc',
    seq: '26437963',
    version: '0.0.785',
  };

  const context: Context = {} as any;

  await expect(handler(event, context)).resolves.toBe(undefined);
  expect(mockS3).not.toHaveReceivedCommand(PutObjectCommand);
  expect(mockSQS).not.toHaveReceivedCommand(SendMessageCommand);
});

test('retries a 404 and stages the tarball once it becomes available', async () => {
  const basePath = 'https://registry.npmjs.org';
  const uri = '@pepperize/cdk-vpc/-/cdk-vpc-0.0.785.tgz';
  const stagingKey = `${S3KeyPrefix.STAGED_KEY_PREFIX}${uri}`;
  const tarball = 'tarball';

  // registry responses: metadata propagated before the tarball did
  nock(basePath)
    .get(`/${uri}`)
    .reply(404)
    .get(`/${uri}`)
    .reply(404)
    .get(`/${uri}`)
    .reply(200, tarball);

  const event: PackageVersion = {
    tarballUrl: `${basePath}/${uri}`,
    integrity: '09d37ec93c5518bf4842ac8e381a5c06452500e5',
    modified: new Date().toISOString(),
    name: '@pepper/cdk-vpc',
    seq: '26437963',
    version: '0.0.785',
  };

  const context: Context = {
    logGroupName: 'group',
    logStreamName: 'stream',
    awsRequestId: 'request-id',
  } as any;

  await expect(handler(event, context)).resolves.toBe(undefined);

  expect(mockS3).toHaveReceivedCommandTimes(PutObjectCommand, 1);
  expect(mockS3).toHaveReceivedCommandWith(PutObjectCommand, {
    Bucket: MOCK_STAGING_BUCKET,
    Key: stagingKey,
    Body: Buffer.from(tarball),
    ContentType: 'application/octet-stream',
    Metadata: expect.anything(),
  });
  expect(mockSQS).toHaveReceivedCommandTimes(SendMessageCommand, 1);
});

test('propagates non-404 errors without retrying', async () => {
  const basePath = 'https://registry.npmjs.org';
  const uri = '/@pepperize/cdk-vpc/-/cdk-vpc-0.0.785.tgz';

  // registry response (a single interceptor: a retry would fail differently)
  nock(basePath).get(uri).reply(500);

  const event: PackageVersion = {
    tarballUrl: `${basePath}${uri}`,
    integrity: '09d37ec93c5518bf4842ac8e381a5c06452500e5',
    modified: new Date().toISOString(),
    name: '@pepper/cdk-vpc',
    seq: '26437963',
    version: '0.0.785',
  };

  const context: Context = {} as any;

  await expect(handler(event, context)).rejects.toThrow(
    /Unsuccessful GET: 500/
  );
  expect(mockS3).not.toHaveReceivedCommand(PutObjectCommand);
  expect(mockSQS).not.toHaveReceivedCommand(SendMessageCommand);
});
