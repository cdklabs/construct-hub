import {
  BatchWriteItemCommand,
  DynamoDBClient,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ChangeMessageVisibilityCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { metricScope, MetricsLogger } from 'aws-embedded-metrics';
import { Unit } from 'aws-embedded-metrics';
import type { Context, SQSEvent, SQSRecord } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import nock from 'nock';
import {
  ENV_DENY_LIST_BUCKET_NAME,
  ENV_DENY_LIST_OBJECT_KEY,
} from '../../../backend/deny-list/constants';
import { EnvironmentVariables as LicenseListEnv } from '../../../backend/license-list/constants';
import {
  ENV_KNOWN_VERSIONS_TABLE_NAME,
  ENV_PACKUMENT_QUEUE_URL,
  MetricName,
  PACKUMENT_MAX_ATTEMPTS,
  PACKUMENT_RETRY_BACKOFF_SECONDS,
} from '../../../package-sources/npmjs/constants.lambda-shared';
import type { PackumentRequest } from '../../../package-sources/npmjs/packument-processing.lambda-shared';
import { handler } from '../../../package-sources/npmjs/packument-processor.lambda';
import { stringToStream } from '../../streams';

jest.mock('aws-embedded-metrics');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockMetricScope = require('aws-embedded-metrics')
  .metricScope as jest.MockedFunction<typeof metricScope>;
const mockPutMetric = jest.fn() as jest.MockedFunction<
  MetricsLogger['putMetric']
>;
const mockMetrics: MetricsLogger = {
  putMetric: mockPutMetric,
  setDimensions: jest.fn(),
  setProperty: jest.fn(),
} as any;
mockMetricScope.mockImplementation((cb) => {
  const impl = cb(mockMetrics);
  return async (...args) => impl(...args);
});

const REGISTRY = 'https://registry.npmjs.org';
const QUEUE_URL =
  'https://sqs.us-east-1.amazonaws.com/123456789012/mock-packument-queue';
const TABLE = 'mock-known-versions-table';
const STAGING_FUNCTION = 'mock-staging-function';
const DENY_LIST_BUCKET = 'deny-list-bucket-name';
const DENY_LIST_OBJECT = 'deny-list.json';
const LICENSE_LIST_BUCKET = 'license-list-bucket-name';
const LICENSE_LIST_OBJECT = 'license-list.json';

const mockS3 = mockClient(S3Client);
const mockLambda = mockClient(LambdaClient);
const mockDynamoDB = mockClient(DynamoDBClient);
const mockSQS = mockClient(SQSClient);

const context: Context = {} as any;

beforeEach(() => {
  mockS3.reset();
  mockLambda.reset();
  mockDynamoDB.reset();
  mockSQS.reset();
  mockPutMetric.mockClear();

  process.env.FUNCTION_NAME = STAGING_FUNCTION;
  process.env[ENV_PACKUMENT_QUEUE_URL] = QUEUE_URL;
  process.env[ENV_KNOWN_VERSIONS_TABLE_NAME] = TABLE;
  process.env[ENV_DENY_LIST_BUCKET_NAME] = DENY_LIST_BUCKET;
  process.env[ENV_DENY_LIST_OBJECT_KEY] = DENY_LIST_OBJECT;
  process.env[LicenseListEnv.BUCKET_NAME] = LICENSE_LIST_BUCKET;
  process.env[LicenseListEnv.OBJECT_KEY] = LICENSE_LIST_OBJECT;

  mockS3
    .on(GetObjectCommand, { Bucket: DENY_LIST_BUCKET, Key: DENY_LIST_OBJECT })
    .resolves({ Body: stringToStream(JSON.stringify({})) });
  mockS3
    .on(GetObjectCommand, {
      Bucket: LICENSE_LIST_BUCKET,
      Key: LICENSE_LIST_OBJECT,
    })
    .resolves({ Body: stringToStream(JSON.stringify(['Apache-2.0'])) });
  mockDynamoDB.on(QueryCommand).resolves({ Items: [] });
  mockDynamoDB.on(BatchWriteItemCommand).resolves({ UnprocessedItems: {} });
  mockLambda.on(InvokeCommand).resolves({ StatusCode: 202 });
  mockSQS.on(ChangeMessageVisibilityCommand).resolves({});
});

afterEach(() => {
  for (const name of [
    'FUNCTION_NAME',
    ENV_PACKUMENT_QUEUE_URL,
    ENV_KNOWN_VERSIONS_TABLE_NAME,
    ENV_DENY_LIST_BUCKET_NAME,
    ENV_DENY_LIST_OBJECT_KEY,
    LicenseListEnv.BUCKET_NAME,
    LicenseListEnv.OBJECT_KEY,
  ]) {
    delete process.env[name];
  }
  nock.cleanAll();
});

function record(
  messageId: string,
  request: Partial<PackumentRequest> | string,
  attempt = 1
): SQSRecord {
  return {
    messageId,
    receiptHandle: `receipt-${messageId}`,
    body:
      typeof request === 'string'
        ? request
        : JSON.stringify({
            seq: 1_000,
            firstSeen: 1_700_000_000_000,
            ...request,
          }),
    attributes: { ApproximateReceiveCount: attempt.toString() },
  } as any;
}

function packageDoc(name: string, rev: string, ...versions: string[]) {
  const time: Record<string, string> = {
    created: '2023-01-01T00:00:00.000Z',
    modified: '2023-06-01T00:00:00.000Z',
  };
  const versionInfos: Record<string, unknown> = {};
  for (const [i, version] of versions.entries()) {
    time[version] = `2023-06-01T00:0${i}:00.000Z`;
    versionInfos[version] = {
      dependencies: { constructs: '^10.0.0' },
      dist: {
        shasum: 'mock-shasum',
        tarball: `${REGISTRY}/${name}/-/${name}-${version}.tgz`,
      },
      jsii: {},
      keywords: ['cdk'],
      license: 'Apache-2.0',
      name,
      version,
    };
  }
  return {
    _id: name,
    _rev: rev,
    'dist-tags': { latest: versions[versions.length - 1] },
    name,
    time,
    versions: versionInfos,
  };
}

function stagedPackages(): Array<{ name: string; version: string }> {
  return mockLambda.commandCalls(InvokeCommand).map((call) => {
    const payload = JSON.parse(
      Buffer.from(call.args[0].input.Payload! as Uint8Array).toString('utf-8')
    );
    return { name: payload.name, version: payload.version };
  });
}

function event(...records: SQSRecord[]): SQSEvent {
  return { Records: records };
}

test('completes a request once the registry serves the expected revision', async () => {
  nock(REGISTRY)
    .get('/caught-up')
    .reply(200, packageDoc('caught-up', '5-aaaaaa', '1.0.0', '1.1.0'));

  const result = await handler(
    event(record('m1', { name: 'caught-up', expectedRev: 5 })),
    context
  );

  expect(result.batchItemFailures).toEqual([]);
  expect(stagedPackages()).toEqual([
    { name: 'caught-up', version: '1.0.0' },
    { name: 'caught-up', version: '1.1.0' },
  ]);
  expect(mockDynamoDB).toHaveReceivedCommand(BatchWriteItemCommand);
  expect(mockSQS).not.toHaveReceivedCommand(ChangeMessageVisibilityCommand);
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.LAGGY_PACKUMENTS_RECOVERED,
    1,
    Unit.Count
  );
});

test('processes what is served, and retries later with back-off while the registry is behind', async () => {
  nock(REGISTRY)
    .get('/still-laggy')
    .reply(200, packageDoc('still-laggy', '3-aaaaaa', '1.0.0'));

  const result = await handler(
    event(record('m1', { name: 'still-laggy', expectedRev: 5 }, 3)),
    context
  );

  expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  expect(stagedPackages()).toEqual([{ name: 'still-laggy', version: '1.0.0' }]);
  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    QueueUrl: QUEUE_URL,
    ReceiptHandle: 'receipt-m1',
    VisibilityTimeout: PACKUMENT_RETRY_BACKOFF_SECONDS[2],
  });
});

test('gives up on the last attempt, so the request moves to the dead-letter queue', async () => {
  nock(REGISTRY)
    .get('/stuck')
    .reply(200, packageDoc('stuck', '3-aaaaaa', '1.0.0'));

  const result = await handler(
    event(
      record('m1', { name: 'stuck', expectedRev: 5 }, PACKUMENT_MAX_ATTEMPTS)
    ),
    context
  );

  // Failing the message on its last receive moves it to the dead-letter
  // queue; it becomes visible right away so that happens promptly.
  expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    VisibilityTimeout: 0,
  });
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.LAGGY_PACKUMENT_GIVE_UPS,
    1,
    Unit.Count
  );
  // What the registry served was still processed.
  expect(stagedPackages()).toEqual([{ name: 'stuck', version: '1.0.0' }]);
});

test('retries a request while the registry has no packument for the package yet', async () => {
  nock(REGISTRY).get('/not-yet').reply(404, 'not found');

  const result = await handler(
    event(record('m1', { name: 'not-yet', expectedRev: 1, reason: 'missing' })),
    context
  );

  expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    VisibilityTimeout: PACKUMENT_RETRY_BACKOFF_SECONDS[0],
  });
  expect(stagedPackages()).toEqual([]);
});

test('counts missing packuments separately from laggy ones', async () => {
  nock(REGISTRY)
    .get('/arrived')
    .reply(200, packageDoc('arrived', '1-aaaaaa', '1.0.0'));
  nock(REGISTRY).get('/never-arrived').reply(404, 'not found');

  const result = await handler(
    event(
      record('m1', { name: 'arrived', expectedRev: 1, reason: 'missing' }),
      record(
        'm2',
        { name: 'never-arrived', expectedRev: 1, reason: 'missing' },
        PACKUMENT_MAX_ATTEMPTS
      )
    ),
    context
  );

  // Both kinds of give-up go to the dead-letter queue.
  expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm2' }]);
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.MISSING_PACKUMENTS_RECOVERED,
    1,
    Unit.Count
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.MISSING_PACKUMENT_GIVE_UPS,
    1,
    Unit.Count
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.LAGGY_PACKUMENTS_RECOVERED,
    0,
    Unit.Count
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.LAGGY_PACKUMENT_GIVE_UPS,
    0,
    Unit.Count
  );
});

test('retries a request that failed with an error, without failing the others', async () => {
  nock(REGISTRY).get('/broken').reply(403, 'forbidden');
  nock(REGISTRY)
    .get('/fine')
    .reply(200, packageDoc('fine', '5-aaaaaa', '1.0.0'));

  const result = await handler(
    event(
      record('m1', { name: 'broken', expectedRev: 5 }),
      record('m2', { name: 'fine', expectedRev: 5 }),
      record('m3', 'not json')
    ),
    context
  );

  expect(result.batchItemFailures).toEqual([
    { itemIdentifier: 'm1' },
    { itemIdentifier: 'm3' },
  ]);
  expect(stagedPackages()).toEqual([{ name: 'fine', version: '1.0.0' }]);
});

test('does not stage versions that are already known', async () => {
  nock(REGISTRY)
    .get('/known')
    .reply(200, packageDoc('known', '5-aaaaaa', '1.0.0', '1.1.0'));
  mockDynamoDB
    .on(QueryCommand)
    .resolves({ Items: [{ version: { S: '1.0.0' } }] });

  await handler(
    event(record('m1', { name: 'known', expectedRev: 5 })),
    context
  );

  expect(stagedPackages()).toEqual([{ name: 'known', version: '1.1.0' }]);
});

test('keeps the back-off when the whole batch fails to set up', async () => {
  mockS3
    .on(GetObjectCommand, { Bucket: DENY_LIST_BUCKET, Key: DENY_LIST_OBJECT })
    .rejects(new Error('s3 is down'));

  await expect(
    handler(
      event(
        record('m1', { name: 'one', expectedRev: 5 }, 2),
        record('m2', { name: 'two', expectedRev: 5 }, 4)
      ),
      context
    )
  ).rejects.toThrow(/s3 is down/);

  // Both messages get their normal next attempt, instead of returning after
  // the queue's visibility timeout and using up their attempts quickly.
  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    ReceiptHandle: 'receipt-m1',
    VisibilityTimeout: PACKUMENT_RETRY_BACKOFF_SECONDS[1],
  });
  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    ReceiptHandle: 'receipt-m2',
    VisibilityTimeout: PACKUMENT_RETRY_BACKOFF_SECONDS[3],
  });
});

test('counts an error on the last attempt as a give-up', async () => {
  nock(REGISTRY).get('/broken').reply(403, 'forbidden');

  const result = await handler(
    event(
      record('m1', { name: 'broken', expectedRev: 5 }, PACKUMENT_MAX_ATTEMPTS)
    ),
    context
  );

  expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.LAGGY_PACKUMENT_GIVE_UPS,
    1,
    Unit.Count
  );
});

test('checks caught-up packages again when their versions could not be recorded', async () => {
  nock(REGISTRY)
    .get('/caught-up')
    .reply(200, packageDoc('caught-up', '5-aaaaaa', '1.0.0'));
  mockDynamoDB.on(BatchWriteItemCommand).rejects(new Error('dynamodb is down'));

  const result = await handler(
    event(record('m1', { name: 'caught-up', expectedRev: 5 })),
    context
  );

  expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    VisibilityTimeout: PACKUMENT_RETRY_BACKOFF_SECONDS[0],
  });
});

test('does not dead-letter a caught-up request when recording fails on its last attempt', async () => {
  nock(REGISTRY)
    .get('/caught-up')
    .reply(200, packageDoc('caught-up', '5-aaaaaa', '1.0.0'));
  mockDynamoDB.on(BatchWriteItemCommand).rejects(new Error('dynamodb is down'));

  const result = await handler(
    event(
      record(
        'm1',
        { name: 'caught-up', expectedRev: 5 },
        PACKUMENT_MAX_ATTEMPTS
      )
    ),
    context
  );

  expect(result.batchItemFailures).toEqual([]);
});

test('dead-letters a missing request whose last check failed', async () => {
  nock(REGISTRY).get('/unknown').reply(403, 'forbidden');

  const result = await handler(
    event(
      record(
        'm1',
        { name: 'unknown', expectedRev: 1, reason: 'missing' },
        PACKUMENT_MAX_ATTEMPTS
      )
    ),
    context
  );

  expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    VisibilityTimeout: 0,
  });
});

test('reports how long laggy packuments took to catch up', async () => {
  nock(REGISTRY)
    .get('/caught-up')
    .reply(200, packageDoc('caught-up', '5-aaaaaa', '1.0.0'));
  const firstSeen = Date.now() - 2 * 60 * 60 * 1_000;

  await handler(
    event(record('m1', { name: 'caught-up', expectedRev: 5, firstSeen })),
    context
  );

  const lag = mockPutMetric.mock.calls.find(
    ([name]) => name === MetricName.LAGGY_PACKUMENT_LAG
  );
  expect(lag?.[1]).toBeGreaterThanOrEqual(2 * 60 * 60 * 1_000);
  expect(lag?.[2]).toBe(Unit.Milliseconds);
});

test('does not report a lag for missing packuments', async () => {
  nock(REGISTRY)
    .get('/arrived')
    .reply(200, packageDoc('arrived', '1-aaaaaa', '1.0.0'));

  await handler(
    event(record('m1', { name: 'arrived', expectedRev: 1, reason: 'missing' })),
    context
  );

  expect(mockPutMetric).not.toHaveBeenCalledWith(
    MetricName.LAGGY_PACKUMENT_LAG,
    expect.anything(),
    expect.anything()
  );
});
