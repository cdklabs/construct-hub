import { gunzipSync } from 'zlib';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import type { metricScope, MetricsLogger } from 'aws-embedded-metrics';
import { Unit } from 'aws-embedded-metrics';
import type { Context, ScheduledEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import nock from 'nock';
import {
  ENV_DENY_LIST_BUCKET_NAME,
  ENV_DENY_LIST_OBJECT_KEY,
} from '../../../backend/deny-list/constants';
import { EnvironmentVariables as LicenseListEnv } from '../../../backend/license-list/constants';
import {
  KNOWN_VERSIONS_FILE_NAME,
  MARKER_FILE_NAME,
  MetricName,
  RECEIPTS_FILE_NAME,
} from '../../../package-sources/npmjs/constants.lambda-shared';
import { FollowerReceipts } from '../../../package-sources/npmjs/follower-receipts.lambda-shared';
import { handler } from '../../../package-sources/npmjs/npm-js-follower.lambda';
import { stringToStream } from '../../streams';

jest.setTimeout(30_000);

jest.mock('aws-embedded-metrics');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockMetricScope = require('aws-embedded-metrics')
  .metricScope as jest.MockedFunction<typeof metricScope>;
const mockPutMetric = jest
  .fn()
  .mockName('MetricsLogger.putMetric') as jest.MockedFunction<
  MetricsLogger['putMetric']
>;
const mockMetrics: MetricsLogger = {
  putMetric: mockPutMetric,
  setDimensions: (...args: any[]) => expect(args).toEqual([{}]),
  setProperty: jest.fn(),
} as any;
mockMetricScope.mockImplementation((cb) => {
  const impl = cb(mockMetrics);
  return async (...args) => impl(...args);
});

const REPLICA = 'https://replicate.npmjs.com';
const REGISTRY = 'https://registry.npmjs.org';

const MOCK_BUCKET = 'mock-staging-bucket';
const MOCK_STAGING_FUNCTION = 'mock-staging-function';
const MOCK_RETRY_QUEUE_URL =
  'https://sqs.test.amazonaws.com/123456789012/retry-queue';
const MOCK_DENY_LIST_BUCKET = 'deny-list-bucket-name';
const MOCK_DENY_LIST_OBJECT = 'my-deny-list.json';
const MOCK_LICENSE_LIST_BUCKET = 'license-list-bucket-name';
const MOCK_LICENSE_LIST_OBJECT = 'license-list.json';

const HOUR = 60 * 60 * 1_000;

const mockS3 = mockClient(S3Client);
const mockLambda = mockClient(LambdaClient);
const mockSQS = mockClient(SQSClient);

const context: Context = {
  awsRequestId: 'mock-request-id',
  logGroupName: 'mock-log-group',
  logStreamName: 'mock-log-stream',
  getRemainingTimeInMillis: () => 300_000,
} as any;

const event: ScheduledEvent = {} as any;

beforeEach(() => {
  mockS3.reset();
  mockLambda.reset();
  mockSQS.reset();
  mockPutMetric.mockClear();

  process.env.BUCKET_NAME = MOCK_BUCKET;
  process.env.FUNCTION_NAME = MOCK_STAGING_FUNCTION;
  process.env.RETRY_QUEUE_URL = MOCK_RETRY_QUEUE_URL;
  process.env[ENV_DENY_LIST_BUCKET_NAME] = MOCK_DENY_LIST_BUCKET;
  process.env[ENV_DENY_LIST_OBJECT_KEY] = MOCK_DENY_LIST_OBJECT;
  process.env[LicenseListEnv.BUCKET_NAME] = MOCK_LICENSE_LIST_BUCKET;
  process.env[LicenseListEnv.OBJECT_KEY] = MOCK_LICENSE_LIST_OBJECT;
  // Do not wait for the registry to catch up in tests.
  process.env.MAX_PACKAGE_SERVER_LAG_MS = '0';

  // Empty deny list
  mockS3
    .on(GetObjectCommand, {
      Bucket: MOCK_DENY_LIST_BUCKET,
      Key: MOCK_DENY_LIST_OBJECT,
    })
    .resolves({ Body: stringToStream(JSON.stringify({})) });
  // License list allowing Apache-2.0
  mockS3
    .on(GetObjectCommand, {
      Bucket: MOCK_LICENSE_LIST_BUCKET,
      Key: MOCK_LICENSE_LIST_OBJECT,
    })
    .resolves({ Body: stringToStream(JSON.stringify(['Apache-2.0'])) });
  // Empty known versions
  mockS3
    .on(GetObjectCommand, {
      Bucket: MOCK_BUCKET,
      Key: KNOWN_VERSIONS_FILE_NAME,
    })
    .resolves({ Body: stringToStream(JSON.stringify({ knownVersions: {} })) });

  mockS3.on(PutObjectCommand).resolves({});
  mockLambda.on(InvokeCommand).resolves({ StatusCode: 202 });
  mockSQS.on(ReceiveMessageCommand).resolves({});
  mockSQS.on(SendMessageCommand).resolves({ MessageId: 'mock-message-id' });
  mockSQS.on(DeleteMessageCommand).resolves({});
});

afterEach(() => {
  delete process.env.BUCKET_NAME;
  delete process.env.FUNCTION_NAME;
  delete process.env.RETRY_QUEUE_URL;
  delete process.env[ENV_DENY_LIST_BUCKET_NAME];
  delete process.env[ENV_DENY_LIST_OBJECT_KEY];
  delete process.env[LicenseListEnv.BUCKET_NAME];
  delete process.env[LicenseListEnv.OBJECT_KEY];
  delete process.env.MAX_PACKAGE_SERVER_LAG_MS;
  nock.cleanAll();
});

function givenMarker(marker: number, updateSeq: number) {
  mockS3
    .on(GetObjectCommand, { Bucket: MOCK_BUCKET, Key: MARKER_FILE_NAME })
    .resolves({ Body: stringToStream(JSON.stringify({ marker })) });
  // The follower verifies the marker against the current DB update_seq.
  nock(REPLICA).get('/').reply(200, {
    db_name: 'registry',
    engine: 'npm-replicate',
    doc_count: 1,
    update_seq: updateSeq,
  });
}

function givenNoReceiptsFile() {
  mockS3
    .on(GetObjectCommand, { Bucket: MOCK_BUCKET, Key: RECEIPTS_FILE_NAME })
    .rejects(Object.assign(new Error('no such key'), { name: 'NoSuchKey' }));
}

function givenReceiptsFile(receipts: FollowerReceipts) {
  mockS3
    .on(GetObjectCommand, { Bucket: MOCK_BUCKET, Key: RECEIPTS_FILE_NAME })
    .resolves({ Body: stringToStream(receipts.toText()) });
}

function savedReceipts(): FollowerReceipts {
  const calls = mockS3
    .commandCalls(PutObjectCommand)
    .filter((call) => call.args[0].input.Key === RECEIPTS_FILE_NAME);
  expect(calls.length).toBeGreaterThan(0);
  const input = calls[calls.length - 1].args[0].input;
  let body = input.Body as Buffer;
  if (input.ContentEncoding === 'gzip') {
    body = gunzipSync(body);
  }
  return FollowerReceipts.fromText(body.toString('utf-8'));
}

function packageDoc(name: string, rev: string, version: string) {
  return {
    _id: name,
    _rev: rev,
    'dist-tags': { latest: version },
    name,
    time: {
      created: '2023-01-01T00:00:00.000Z',
      modified: '2023-06-01T00:00:00.000Z',
      [version]: '2023-06-01T00:00:00.000Z',
    },
    versions: {
      [version]: {
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
      },
    },
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

test('defers changes with stale registry metadata to the retry queue', async () => {
  givenMarker(1_000, 2_000);
  givenNoReceiptsFile();

  // Head pass: one batch with a change announcing rev 5...
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '100', since: '1000' })
    .reply(200, {
      results: [
        {
          seq: 1_005,
          id: 'stale-package',
          changes: [{ rev: '5-aaaaaa' }],
          deleted: false,
        },
      ],
      last_seq: 1_010,
    });
  // ... but the registry still serves rev 3.
  nock(REGISTRY)
    .get('/stale-package')
    .reply(200, packageDoc('stale-package', '3-bbbbbb', '1.0.0'));
  // Second head batch: caught up.
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '100', since: '1010' })
    .reply(200, { results: [], last_seq: 1_010 });
  // The (first ever) sweep starts from the only checkpoint, and is empty.
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '10000', since: '1010' })
    .reply(200, { results: [], last_seq: 1_010 });

  await handler(event, context);

  // The change was deferred to the retry queue, not processed.
  expect(mockLambda).not.toHaveReceivedCommand(InvokeCommand);
  expect(mockSQS).toHaveReceivedCommandTimes(SendMessageCommand, 1);
  const sent = JSON.parse(
    mockSQS.commandCalls(SendMessageCommand)[0].args[0].input.MessageBody!
  );
  expect(sent).toEqual(
    expect.objectContaining({
      name: 'stale-package',
      expectedRev: 5,
      seq: 1_005,
    })
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.STALE_METADATA_DEFERRED,
    1,
    Unit.Count
  );

  // The follower's position was checkpointed, and the first (deep) sweep
  // completed. Note the received row's receipt is pruned away because it is
  // below the earliest checkpoint (no sweep can ever reach it) - the row's
  // safety is guaranteed by the retry queue message instead.
  const receipts = savedReceipts();
  expect(receipts.checkpointCount).toBe(1);
  expect(receipts.lastDeepSweepAt).toBeDefined();
});

test('overlap sweep discovers and stages late-inserted changes', async () => {
  const now = Date.now();
  givenMarker(1_000, 2_000);

  // Receipts: the head pass passed seq 500 seven hours ago and seq 1000 five
  // minutes ago. Seq 550 was received; seq 600 was NOT (it was inserted into
  // the feed late). Sweeps have run recently enough that only a regular
  // sweep is due.
  const receipts = new FollowerReceipts();
  receipts.addCheckpoint(500, now - 7 * HOUR);
  receipts.addCheckpoint(1_000, now - 5 * 60_000);
  receipts.addSeqs([550]);
  receipts.lastSweepAt = now - 2 * HOUR;
  receipts.lastDeepSweepAt = now - 2 * HOUR;
  givenReceiptsFile(receipts);

  // Head pass: already caught up.
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '100', since: '1000' })
    .reply(200, { results: [], last_seq: 1_000 });
  // Regular sweep: starts from the checkpoint at/bordering (now - margin),
  // i.e. seq 500. It returns one already-received row (550) and one late row
  // (600). Only the late row's metadata may be fetched.
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '10000', since: '500' })
    .reply(200, {
      results: [
        {
          seq: 550,
          id: 'already-seen-package',
          changes: [{ rev: '1-cccccc' }],
          deleted: false,
        },
        {
          seq: 600,
          id: 'late-package',
          changes: [{ rev: '2-dddddd' }],
          deleted: false,
        },
      ],
      last_seq: 1_000,
    });
  nock(REGISTRY)
    .get('/late-package')
    .reply(200, packageDoc('late-package', '2-dddddd', '1.2.3'));

  await handler(event, context);

  // The late package version was sent for staging.
  expect(stagedPackages()).toEqual([
    { name: 'late-package', version: '1.2.3' },
  ]);
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.LATE_CHANGE_COUNT,
    1,
    Unit.Count
  );
  // The lag is measured against the checkpoint that first crossed seq 600
  // (the one taken 5 minutes ago).
  const lagCalls = mockPutMetric.mock.calls.filter(
    ([name]) => name === MetricName.LATE_CHANGE_LAG
  );
  expect(lagCalls).toHaveLength(1);
  expect(lagCalls[0][1]).toBeGreaterThanOrEqual(5 * 60_000);
  expect(lagCalls[0][1]).toBeLessThan(HOUR);

  // The sweep completed and recorded receipts for the swept rows.
  const saved = savedReceipts();
  expect(saved.has(600)).toBe(true);
  expect(saved.lastSweepAt).toBeGreaterThanOrEqual(now);
  expect(saved.sweepCursor).toBeUndefined();
});

test('recovers deferred changes from the retry queue once the registry catches up', async () => {
  givenMarker(2_000, 3_000);
  givenNoReceiptsFile();

  // One deferred message is waiting on the retry queue.
  mockSQS
    .on(ReceiveMessageCommand)
    .resolvesOnce({
      Messages: [
        {
          Body: JSON.stringify({
            name: 'recovered-package',
            expectedRev: 4,
            seq: 1_500,
            firstSeenAt: '2023-06-01T00:00:00.000Z',
          }),
          MessageId: 'mock-message-id',
          ReceiptHandle: 'mock-receipt-handle',
        },
      ],
    })
    .resolves({});
  // The registry has now caught up with the announced revision.
  nock(REGISTRY)
    .get('/recovered-package')
    .reply(200, packageDoc('recovered-package', '4-eeeeee', '2.0.0'));

  // Head pass: caught up; sweep: empty.
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '100', since: '2000' })
    .reply(200, { results: [], last_seq: 2_000 });
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '10000', since: '2000' })
    .reply(200, { results: [], last_seq: 2_000 });

  await handler(event, context);

  // The deferred package version was staged and the message deleted.
  expect(stagedPackages()).toEqual([
    { name: 'recovered-package', version: '2.0.0' },
  ]);
  expect(mockSQS).toHaveReceivedCommandWith(DeleteMessageCommand, {
    QueueUrl: MOCK_RETRY_QUEUE_URL,
    ReceiptHandle: 'mock-receipt-handle',
  });
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.STALE_METADATA_RECOVERED,
    1,
    Unit.Count
  );
});

test('leaves still-stale messages on the retry queue', async () => {
  givenMarker(2_000, 3_000);
  givenNoReceiptsFile();

  mockSQS
    .on(ReceiveMessageCommand)
    .resolvesOnce({
      Messages: [
        {
          Body: JSON.stringify({
            name: 'still-stale-package',
            expectedRev: 9,
            seq: 1_600,
          }),
          MessageId: 'mock-message-id',
          ReceiptHandle: 'mock-receipt-handle',
        },
      ],
    })
    .resolves({});
  // The registry is still behind the announced revision.
  nock(REGISTRY)
    .get('/still-stale-package')
    .reply(200, packageDoc('still-stale-package', '7-ffffff', '3.0.0'));

  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '100', since: '2000' })
    .reply(200, { results: [], last_seq: 2_000 });
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '10000', since: '2000' })
    .reply(200, { results: [], last_seq: 2_000 });

  await handler(event, context);

  // Nothing staged, message NOT deleted (it will be re-delivered).
  expect(mockLambda).not.toHaveReceivedCommand(InvokeCommand);
  expect(mockSQS).not.toHaveReceivedCommand(DeleteMessageCommand);
});
