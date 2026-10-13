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
  ENV_PACKUMENT_DEAD_LETTER_QUEUE_ARN,
  ENV_PACKUMENT_QUEUE_URL,
  MetricName,
  PACKUMENT_MAX_RETRY_DELAY_SECONDS,
  PACKUMENT_MIN_RETRY_DELAY_SECONDS,
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
const QUEUE_ARN = 'arn:aws:sqs:us-east-1:123456789012:mock-packument-queue';
const DLQ_ARN = 'arn:aws:sqs:us-east-1:123456789012:mock-packument-dlq';
const MINUTE = 60 * 1_000;
const HOUR = 60 * MINUTE;
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
  process.env[ENV_PACKUMENT_DEAD_LETTER_QUEUE_ARN] = DLQ_ARN;
  // No jitter, unless a test says otherwise.
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
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
    ENV_PACKUMENT_DEAD_LETTER_QUEUE_ARN,
    ENV_KNOWN_VERSIONS_TABLE_NAME,
    ENV_DENY_LIST_BUCKET_NAME,
    ENV_DENY_LIST_OBJECT_KEY,
    LicenseListEnv.BUCKET_NAME,
    LicenseListEnv.OBJECT_KEY,
  ]) {
    delete process.env[name];
  }
  nock.cleanAll();
  jest.restoreAllMocks();
});

function record(
  messageId: string,
  request: Partial<PackumentRequest> | string,
  { source = QUEUE_ARN, age = 0 }: { source?: string; age?: number } = {}
): SQSRecord {
  return {
    messageId,
    receiptHandle: `receipt-${messageId}`,
    eventSourceARN: source,
    body:
      typeof request === 'string'
        ? request
        : JSON.stringify({
            seq: 1_000,
            firstSeen: Date.now() - age,
            ...request,
          }),
    attributes: { ApproximateReceiveCount: '1' },
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

test('processes what is served, and waits as long as the request is old before the next attempt', async () => {
  nock(REGISTRY)
    .get('/still-laggy')
    .reply(200, packageDoc('still-laggy', '3-aaaaaa', '1.0.0'));

  const result = await handler(
    event(
      record(
        'm1',
        { name: 'still-laggy', expectedRev: 5 },
        { age: 40 * MINUTE }
      )
    ),
    context
  );

  expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  expect(stagedPackages()).toEqual([{ name: 'still-laggy', version: '1.0.0' }]);
  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    QueueUrl: QUEUE_URL,
    ReceiptHandle: 'receipt-m1',
    VisibilityTimeout: 40 * 60,
  });
});

test('keeps the wait within the minimum and maximum delay', async () => {
  nock(REGISTRY)
    .persist()
    .get('/still-laggy')
    .reply(200, packageDoc('still-laggy', '3-aaaaaa', '1.0.0'));

  await handler(
    event(
      record('young', { name: 'still-laggy', expectedRev: 5 }, { age: 0 }),
      record('old', { name: 'still-laggy', expectedRev: 5 }, { age: 20 * HOUR })
    ),
    context
  );

  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    ReceiptHandle: 'receipt-young',
    VisibilityTimeout: PACKUMENT_MIN_RETRY_DELAY_SECONDS,
  });
  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    ReceiptHandle: 'receipt-old',
    VisibilityTimeout: PACKUMENT_MAX_RETRY_DELAY_SECONDS,
  });
});

test('adds jitter to the wait', async () => {
  nock(REGISTRY)
    .persist()
    .get('/still-laggy')
    .reply(200, packageDoc('still-laggy', '3-aaaaaa', '1.0.0'));
  jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(1);

  await handler(
    event(
      record('m1', { name: 'still-laggy', expectedRev: 5 }, { age: HOUR }),
      record('m2', { name: 'still-laggy', expectedRev: 5 }, { age: HOUR })
    ),
    context
  );

  const timeouts = mockSQS
    .commandCalls(ChangeMessageVisibilityCommand)
    .map((call) => call.args[0].input.VisibilityTimeout)
    .sort();
  expect(timeouts).toEqual([0.8 * 3_600, 1.2 * 3_600]);
});

test('retries a request while the registry has no packument for the package yet', async () => {
  nock(REGISTRY).get('/not-yet').reply(404, 'not found');

  const result = await handler(
    event(record('m1', { name: 'not-yet', expectedRev: 1, reason: 'missing' })),
    context
  );

  expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    VisibilityTimeout: PACKUMENT_MIN_RETRY_DELAY_SECONDS,
  });
  expect(stagedPackages()).toEqual([]);
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

test('keeps the usual waits when the whole batch fails to set up', async () => {
  mockS3
    .on(GetObjectCommand, { Bucket: DENY_LIST_BUCKET, Key: DENY_LIST_OBJECT })
    .rejects(new Error('s3 is down'));

  await expect(
    handler(
      event(
        record('m1', { name: 'one', expectedRev: 5 }, { age: 20 * MINUTE }),
        record('m2', { name: 'two', expectedRev: 5 }, { age: 2 * HOUR })
      ),
      context
    )
  ).rejects.toThrow(/s3 is down/);

  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    ReceiptHandle: 'receipt-m1',
    VisibilityTimeout: 20 * 60,
  });
  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    ReceiptHandle: 'receipt-m2',
    VisibilityTimeout: 2 * 3_600,
  });
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
    VisibilityTimeout: PACKUMENT_MIN_RETRY_DELAY_SECONDS,
  });
});

test('reports how long laggy packuments took to catch up', async () => {
  nock(REGISTRY)
    .get('/caught-up')
    .reply(200, packageDoc('caught-up', '5-aaaaaa', '1.0.0'));

  await handler(
    event(
      record('m1', { name: 'caught-up', expectedRev: 5 }, { age: 2 * HOUR })
    ),
    context
  );

  const lag = mockPutMetric.mock.calls.find(
    ([name]) => name === MetricName.LAGGY_PACKUMENT_LAG
  );
  expect(lag?.[1]).toBeGreaterThanOrEqual(2 * HOUR);
  expect(lag?.[2]).toBe(Unit.Milliseconds);
});

test('counts missing packuments that arrived separately from laggy ones, without a lag', async () => {
  nock(REGISTRY)
    .get('/arrived')
    .reply(200, packageDoc('arrived', '1-aaaaaa', '1.0.0'));

  await handler(
    event(record('m1', { name: 'arrived', expectedRev: 1, reason: 'missing' })),
    context
  );

  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.MISSING_PACKUMENTS_RECOVERED,
    1,
    Unit.Count
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.LAGGY_PACKUMENTS_RECOVERED,
    0,
    Unit.Count
  );
  expect(mockPutMetric).not.toHaveBeenCalledWith(
    MetricName.LAGGY_PACKUMENT_LAG,
    expect.anything(),
    expect.anything()
  );
});

describe('dead-letter queue', () => {
  test('logs, counts and deletes requests that were given up on, without checking them', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await handler(
      event(
        record(
          'm1',
          { name: 'stuck', expectedRev: 5 },
          { source: DLQ_ARN, age: 29 * HOUR }
        ),
        record(
          'm2',
          { name: 'never-arrived', expectedRev: 1, reason: 'missing' },
          { source: DLQ_ARN }
        )
      ),
      context
    );

    // Deleted (no fetch: nock would reject one).
    expect(result.batchItemFailures).toEqual([]);
    expect(mockSQS).not.toHaveReceivedCommand(ChangeMessageVisibilityCommand);
    expect(stagedPackages()).toEqual([]);
    expect(mockPutMetric).toHaveBeenCalledWith(
      MetricName.LAGGY_PACKUMENT_GIVE_UPS,
      1,
      Unit.Count
    );
    expect(mockPutMetric).toHaveBeenCalledWith(
      MetricName.MISSING_PACKUMENT_GIVE_UPS,
      1,
      Unit.Count
    );
    const lag = mockPutMetric.mock.calls.find(
      ([name]) => name === MetricName.LAGGY_PACKUMENT_LAG
    );
    expect(lag?.[1]).toBeGreaterThanOrEqual(29 * HOUR);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Giving up on laggy packument for stuck')
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Giving up on missing packument for never-arrived'
      )
    );
  });

  test('deletes an invalid request it was given up on', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await handler(
      event(record('m1', 'not json', { source: DLQ_ARN })),
      context
    );

    expect(result.batchItemFailures).toEqual([]);
  });

  test('handles a batch from either queue on its own', async () => {
    nock(REGISTRY)
      .get('/caught-up')
      .reply(200, packageDoc('caught-up', '5-aaaaaa', '1.0.0'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await handler(
      event(
        record('m1', { name: 'caught-up', expectedRev: 5 }),
        record('m2', { name: 'stuck', expectedRev: 5 }, { source: DLQ_ARN })
      ),
      context
    );

    expect(result.batchItemFailures).toEqual([]);
    expect(stagedPackages()).toEqual([{ name: 'caught-up', version: '1.0.0' }]);
  });
});
