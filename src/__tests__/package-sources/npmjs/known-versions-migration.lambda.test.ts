import {
  BatchWriteItemCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import {
  ENV_KNOWN_VERSIONS_TABLE_NAME,
  KNOWN_VERSIONS_FILE_NAME,
  MARKER_FILE_NAME,
} from '../../../package-sources/npmjs/constants.lambda-shared';
import { handler } from '../../../package-sources/npmjs/known-versions-migration.lambda';
import { stringToStream } from '../../streams';

const MOCK_BUCKET = 'mock-staging-bucket';
const MOCK_TABLE = 'mock-known-versions-table';

const mockS3 = mockClient(S3Client);
const mockDynamoDB = mockClient(DynamoDBClient);

beforeEach(() => {
  mockS3.reset();
  mockDynamoDB.reset();
  process.env.BUCKET_NAME = MOCK_BUCKET;
  process.env[ENV_KNOWN_VERSIONS_TABLE_NAME] = MOCK_TABLE;
  mockDynamoDB.on(BatchWriteItemCommand).resolves({ UnprocessedItems: {} });
  givenNoObject(KNOWN_VERSIONS_FILE_NAME);
  givenNoObject(MARKER_FILE_NAME);
});

afterEach(() => {
  delete process.env.BUCKET_NAME;
  delete process.env[ENV_KNOWN_VERSIONS_TABLE_NAME];
});

function givenNoObject(key: string) {
  mockS3
    .on(GetObjectCommand, { Bucket: MOCK_BUCKET, Key: key })
    .rejects(Object.assign(new Error('no such key'), { name: 'NoSuchKey' }));
}

function givenObject(key: string, content: unknown) {
  mockS3
    .on(GetObjectCommand, { Bucket: MOCK_BUCKET, Key: key })
    .resolves({ Body: stringToStream(JSON.stringify(content)) });
}

/** The `name@version` keys written to the table, sorted. */
function writtenKeys(): string[] {
  return mockDynamoDB
    .commandCalls(BatchWriteItemCommand)
    .flatMap((call) => call.args[0].input.RequestItems![MOCK_TABLE])
    .map(
      (request) =>
        `${request.PutRequest!.Item!.name.S}@${
          request.PutRequest!.Item!.version.S
        }`
    )
    .sort();
}

test('copies the known versions file to the table', async () => {
  givenObject(KNOWN_VERSIONS_FILE_NAME, {
    knownVersions: {
      'some-package@1.0.0': '2023-06-01T00:00:00.000Z',
      '@scope/other-package@2.0.0-pre.1': '2023-06-02T00:00:00.000Z',
    },
  });

  const result = await handler();

  expect(result).toEqual({ written: 2, skipped: [] });
  expect(writtenKeys()).toEqual([
    '@scope/other-package@2.0.0-pre.1',
    'some-package@1.0.0',
  ]);
});

test('copies the known versions embedded in the legacy marker file', async () => {
  givenObject(MARKER_FILE_NAME, {
    marker: 1_000,
    knownVersions: { 'legacy-package@1.0.0': 1685577600000 },
  });

  const result = await handler();

  expect(result).toEqual({ written: 1, skipped: [] });
  expect(writtenKeys()).toEqual(['legacy-package@1.0.0']);
});

test('does nothing on a new deployment', async () => {
  const result = await handler();

  expect(result).toEqual({ written: 0, skipped: [] });
  expect(mockDynamoDB).not.toHaveReceivedCommand(BatchWriteItemCommand);
});

test('skips records the table cannot store', async () => {
  const tooLong = `long-package@${'1'.repeat(1_025)}`;
  givenObject(KNOWN_VERSIONS_FILE_NAME, {
    knownVersions: {
      'good-package@1.0.0': '2023-06-01T00:00:00.000Z',
      '@scope/no-version': '2023-06-01T00:00:00.000Z',
      'no-version@': '2023-06-01T00:00:00.000Z',
      [tooLong]: '2023-06-01T00:00:00.000Z',
    },
  });

  const result = await handler();

  expect(result).toEqual({
    written: 1,
    skipped: ['@scope/no-version', 'no-version@', tooLong],
  });
  expect(writtenKeys()).toEqual(['good-package@1.0.0']);
});

test('fails on other errors, so the invocation is retried', async () => {
  givenObject(KNOWN_VERSIONS_FILE_NAME, {
    knownVersions: { 'good-package@1.0.0': '2023-06-01T00:00:00.000Z' },
  });
  mockDynamoDB.on(BatchWriteItemCommand).rejects(new Error('network'));

  await expect(handler()).rejects.toThrow(/network/);
});
