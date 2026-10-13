import { gzipSync } from 'zlib';
import {
  BatchWriteItemCommand,
  DynamoDBClient,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  ChangeMessageVisibilityCommand,
  SendMessageBatchCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
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
  PACKUMENT_MAX_AGE_MS,
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
const mockSetDimensions = jest.fn() as jest.MockedFunction<
  MetricsLogger['setDimensions']
>;
const mockMetrics: MetricsLogger = {
  putMetric: mockPutMetric,
  setDimensions: mockSetDimensions,
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
  mockSetDimensions.mockClear();

  process.env.FUNCTION_NAME = STAGING_FUNCTION;
  process.env[ENV_PACKUMENT_QUEUE_URL] = QUEUE_URL;
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
  mockSQS.on(SendMessageBatchCommand).resolves({ Successful: [], Failed: [] });
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
  jest.restoreAllMocks();
});

function record(
  messageId: string,
  request: Partial<PackumentRequest> | string,
  { age = 0, receiveCount = 1 }: { age?: number; receiveCount?: number } = {}
): SQSRecord {
  return {
    messageId,
    receiptHandle: `receipt-${messageId}`,
    eventSourceARN: QUEUE_ARN,
    body:
      typeof request === 'string'
        ? request
        : JSON.stringify({
            seq: 1_000,
            firstSeen: Date.now() - age,
            ...request,
          }),
    attributes: { ApproximateReceiveCount: String(receiveCount) },
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
  expect(mockSQS).not.toHaveReceivedCommand(SendMessageBatchCommand);
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.FAILED_PACKUMENT_RETRIEVALS,
    0,
    Unit.Count
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.NPMJS_CHANGE_AGE,
    expect.any(Number),
    Unit.Milliseconds
  );
  // Caught up on the first attempt: no delay.
  expect(metricValues(MetricName.PACKUMENT_DELAY)).toEqual([]);
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
  // The same message is checked again; nothing replaces it.
  expect(mockSQS).not.toHaveReceivedCommand(SendMessageBatchCommand);
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.FAILED_PACKUMENT_RETRIEVALS,
    1,
    Unit.Count
  );
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
    event(record('m1', { name: 'not-yet', expectedRev: 1 })),
    context
  );

  expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  expect(mockSQS).toHaveReceivedCommandWith(ChangeMessageVisibilityCommand, {
    VisibilityTimeout: PACKUMENT_MIN_RETRY_DELAY_SECONDS,
  });
  expect(stagedPackages()).toEqual([]);
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.FAILED_PACKUMENT_RETRIEVALS,
    1,
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
  // The invalid message is not a failed retrieval.
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.FAILED_PACKUMENT_RETRIEVALS,
    1,
    Unit.Count
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.METADATA_FETCH_FAILURES,
    1,
    Unit.Count
  );
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

test('reports how long a packument took to arrive when it caught up on a later attempt', async () => {
  nock(REGISTRY)
    .get('/caught-up')
    .reply(200, packageDoc('caught-up', '5-aaaaaa', '1.0.0'));

  await handler(
    event(
      record(
        'm1',
        { name: 'caught-up', expectedRev: 5 },
        { age: 2 * HOUR, receiveCount: 4 }
      )
    ),
    context
  );

  const [delay] = metricValues(MetricName.PACKUMENT_DELAY);
  expect(delay).toBeGreaterThanOrEqual(2 * 3_600);
  expect(delay).toBeLessThan(2 * 3_600 + 60);
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.PACKUMENT_DELAY,
    delay,
    Unit.Seconds
  );
});

test('reads requests sent by earlier versions, ignoring their reason', async () => {
  nock(REGISTRY)
    .get('/old-request')
    .reply(200, packageDoc('old-request', '5-aaaaaa', '1.0.0'));

  const result = await handler(
    event(
      record(
        'm1',
        JSON.stringify({
          name: 'old-request',
          expectedRev: 5,
          firstSeen: Date.now(),
          reason: 'missing',
        })
      )
    ),
    context
  );

  expect(result.batchItemFailures).toEqual([]);
  expect(stagedPackages()).toEqual([{ name: 'old-request', version: '1.0.0' }]);
});

describe('giving up', () => {
  const OLD = PACKUMENT_MAX_AGE_MS + MINUTE;

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  test('a request older than a day is given up on when the registry is still behind, after processing what it serves', async () => {
    nock(REGISTRY)
      .get('/stuck')
      .reply(200, packageDoc('stuck', '3-aaaaaa', '1.0.0'));

    const result = await handler(
      event(
        record(
          'm1',
          { name: 'stuck', expectedRev: 5 },
          { age: OLD, receiveCount: 12 }
        )
      ),
      context
    );

    expect(result.batchItemFailures).toEqual([]);
    expect(mockSQS).not.toHaveReceivedCommand(ChangeMessageVisibilityCommand);
    expect(stagedPackages()).toEqual([{ name: 'stuck', version: '1.0.0' }]);
    expect(giveUps()).toEqual({ Laggy: 1 });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Giving up on stuck: the registry still serves rev 3, not rev 5'
      )
    );
  });

  test('the last check decides the reason', async () => {
    nock(REGISTRY).get('/never-arrived').reply(404, 'not found');
    nock(REGISTRY).get('/unreachable').reply(403, 'forbidden');

    const result = await handler(
      event(
        record('m1', { name: 'never-arrived', expectedRev: 1 }, { age: OLD }),
        record('m2', { name: 'unreachable', expectedRev: 1 }, { age: OLD })
      ),
      context
    );

    expect(result.batchItemFailures).toEqual([]);
    expect(giveUps()).toEqual({ Missing: 1, Unreachable: 1 });
  });

  test('give-ups are counted by reason and in total', async () => {
    nock(REGISTRY).get('/never-arrived').reply(404, 'not found');

    await handler(
      event(
        record('m1', { name: 'never-arrived', expectedRev: 1 }, { age: OLD })
      ),
      context
    );

    expect(mockSetDimensions).toHaveBeenCalledWith([{ Reason: 'Missing' }, {}]);
    expect(mockPutMetric).toHaveBeenCalledWith(
      MetricName.PACKUMENT_GIVE_UPS,
      1,
      Unit.Count
    );
  });

  test('a request older than a day that catches up is done, not given up on', async () => {
    nock(REGISTRY)
      .get('/late')
      .reply(200, packageDoc('late', '5-aaaaaa', '1.0.0'));

    await handler(
      event(
        record(
          'm1',
          { name: 'late', expectedRev: 5 },
          { age: OLD, receiveCount: 12 }
        )
      ),
      context
    );

    expect(giveUps()).toEqual({});
    expect(metricValues(MetricName.PACKUMENT_DELAY)).toHaveLength(1);
  });

  test('a request given up on is still checked again when its versions could not be recorded', async () => {
    nock(REGISTRY)
      .get('/stuck')
      .reply(200, packageDoc('stuck', '3-aaaaaa', '1.0.0'));
    mockDynamoDB
      .on(BatchWriteItemCommand)
      .rejects(new Error('dynamodb is down'));

    const result = await handler(
      event(record('m1', { name: 'stuck', expectedRev: 5 }, { age: OLD })),
      context
    );

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }]);
  });
});

describe('processing', () => {
  function changeRecord(
    messageId: string,
    name: string,
    expectedRev: number
  ): SQSRecord {
    return record(messageId, { name, expectedRev, seq: 1_005 });
  }

  test('retries truncated gzip responses from the registry', async () => {
    // The first response is a truncated gzip body (Z_BUF_ERROR), the retry
    // succeeds.
    const fullBody = gzipSync(
      Buffer.from(
        JSON.stringify(packageDoc('flaky-package', '1-aaaaaa', '1.0.0'))
      )
    );
    nock(REGISTRY)
      .get('/flaky-package')
      .reply(200, fullBody.subarray(0, fullBody.length - 8), {
        'content-encoding': 'gzip',
      });
    nock(REGISTRY)
      .get('/flaky-package')
      .reply(200, packageDoc('flaky-package', '1-aaaaaa', '1.0.0'));

    const result = await handler(
      event(changeRecord('m1', 'flaky-package', 1)),
      context
    );

    expect(result.batchItemFailures).toEqual([]);
    expect(stagedPackages()).toEqual([
      { name: 'flaky-package', version: '1.0.0' },
    ]);
  });

  test('records the staged versions in the table', async () => {
    nock(REGISTRY)
      .get('/known-package')
      .reply(200, packageDoc('known-package', '1-aaaaaa', '1.0.0', '1.1.0'));
    mockDynamoDB
      .on(QueryCommand)
      .resolves({ Items: [{ version: { S: '1.0.0' } }] });

    await handler(event(changeRecord('m1', 'known-package', 1)), context);

    expect(stagedPackages()).toEqual([
      { name: 'known-package', version: '1.1.0' },
    ]);
    const recorded = mockDynamoDB
      .commandCalls(BatchWriteItemCommand)
      .flatMap((call) => call.args[0].input.RequestItems![TABLE])
      .map(
        (request) =>
          `${request.PutRequest!.Item!.name.S}@${
            request.PutRequest!.Item!.version.S
          }`
      );
    expect(recorded).toEqual(['known-package@1.1.0']);
  });

  test('does not query the table for packages without construct library versions', async () => {
    nock(REGISTRY)
      .get('/boring-package')
      .reply(200, {
        ...packageDoc('boring-package', '1-aaaaaa'),
        time: {
          created: '2023-01-01T00:00:00.000Z',
          modified: '2023-06-01T00:00:00.000Z',
          '1.0.0': '2023-06-01T00:00:00.000Z',
        },
        versions: {
          '1.0.0': {
            dist: { shasum: 'mock-shasum', tarball: `${REGISTRY}/b.tgz` },
            name: 'boring-package',
            version: '1.0.0',
          },
        },
      });

    await handler(event(changeRecord('m1', 'boring-package', 1)), context);

    expect(mockDynamoDB).not.toHaveReceivedCommand(QueryCommand);
    expect(stagedPackages()).toEqual([]);
  });

  test('skips packages last modified before constructs existed', async () => {
    const doc = packageDoc('ancient-package', '1-aaaaaa', '1.0.0');
    nock(REGISTRY)
      .get('/ancient-package')
      .reply(200, {
        ...doc,
        time: { ...doc.time, modified: '2015-01-01T00:00:00.000Z' },
      });

    const result = await handler(
      event(changeRecord('m1', 'ancient-package', 1)),
      context
    );

    expect(result.batchItemFailures).toEqual([]);
    expect(stagedPackages()).toEqual([]);
  });
});

/** The values put for a metric, in order. */
function metricValues(name: MetricName): number[] {
  return mockPutMetric.mock.calls
    .filter(([metric]) => metric === name)
    .map(([, value]) => value as number);
}

/** The give-ups counted, by reason. */
function giveUps(): Record<string, number> {
  const result: Record<string, number> = {};
  const puts = mockPutMetric.mock.calls.map((call, i) => ({
    name: call[0],
    value: call[1] as number,
    order: mockPutMetric.mock.invocationCallOrder[i],
  }));
  mockSetDimensions.mock.calls.forEach(([sets], i) => {
    const reason = Array.isArray(sets) ? sets[0]?.Reason : undefined;
    if (reason == null) {
      return;
    }
    // The give-up count put right after these dimensions were set.
    const order = mockSetDimensions.mock.invocationCallOrder[i];
    const put = puts.find(
      (p) => p.order > order && p.name === MetricName.PACKUMENT_GIVE_UPS
    );
    result[reason] = (result[reason] ?? 0) + (put?.value ?? 0);
  });
  return result;
}
