import { gunzipSync } from 'zlib';
import {
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { metricScope, MetricsLogger } from 'aws-embedded-metrics';
import { Unit } from 'aws-embedded-metrics';
import type { Context, ScheduledEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import nock from 'nock';
import {
  ENV_PACKUMENT_QUEUE_URL,
  FOLLOWER_STATE_FILE_NAME,
  MARKER_FILE_NAME,
  MetricName,
} from '../../../package-sources/npmjs/constants.lambda-shared';
import { FollowerState } from '../../../package-sources/npmjs/follower-state.lambda-shared';
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

const MOCK_BUCKET = 'mock-staging-bucket';
const MOCK_PACKUMENT_QUEUE_URL =
  'https://sqs.us-east-1.amazonaws.com/123456789012/mock-packument-queue';

const HOUR = 60 * 60 * 1_000;

const mockS3 = mockClient(S3Client);
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
  mockSQS.reset();
  mockPutMetric.mockClear();

  process.env.BUCKET_NAME = MOCK_BUCKET;
  process.env[ENV_PACKUMENT_QUEUE_URL] = MOCK_PACKUMENT_QUEUE_URL;

  // No legacy marker by default
  mockS3
    .on(GetObjectCommand, { Bucket: MOCK_BUCKET, Key: MARKER_FILE_NAME })
    .rejects(noSuchKey());
  mockS3.on(PutObjectCommand).resolves({});
  mockSQS.on(SendMessageBatchCommand).resolves({ Successful: [], Failed: [] });
});

afterEach(() => {
  delete process.env.BUCKET_NAME;
  delete process.env[ENV_PACKUMENT_QUEUE_URL];
  nock.cleanAll();
});

function noSuchKey() {
  return Object.assign(new Error('no such key'), { name: 'NoSuchKey' });
}

function givenHead(updateSeq: number) {
  nock(REPLICA).get('/').reply(200, {
    db_name: 'registry',
    engine: 'npm-replicate',
    doc_count: 1,
    update_seq: updateSeq,
  });
}

function givenNoStateFile() {
  mockS3
    .on(GetObjectCommand, {
      Bucket: MOCK_BUCKET,
      Key: FOLLOWER_STATE_FILE_NAME,
    })
    .rejects(noSuchKey());
}

function givenStateFile(state: FollowerState) {
  mockS3
    .on(GetObjectCommand, {
      Bucket: MOCK_BUCKET,
      Key: FOLLOWER_STATE_FILE_NAME,
    })
    .resolves({ Body: stringToStream(state.toText()) });
}

function givenLegacyMarker(marker: number) {
  mockS3
    .on(GetObjectCommand, { Bucket: MOCK_BUCKET, Key: MARKER_FILE_NAME })
    .resolves({ Body: stringToStream(JSON.stringify({ marker })) });
}

function givenChanges(since: number, results: object[], lastSeq: number): void {
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '10000', since: String(since) })
    .reply(200, { results, last_seq: lastSeq });
}

function change(seq: number, id: string, rev = '1-aaaaaa', deleted = false) {
  return { seq, id, changes: [{ rev }], deleted };
}

function savedState(): FollowerState {
  const calls = mockS3
    .commandCalls(PutObjectCommand)
    .filter((call) => call.args[0].input.Key === FOLLOWER_STATE_FILE_NAME);
  expect(calls.length).toBeGreaterThan(0);
  const input = calls[calls.length - 1].args[0].input;
  let body = input.Body as Buffer;
  if (input.ContentEncoding === 'gzip') {
    body = gunzipSync(body);
  }
  return FollowerState.fromText(body.toString('utf-8'));
}

function statePutCount(): number {
  return mockS3
    .commandCalls(PutObjectCommand)
    .filter((call) => call.args[0].input.Key === FOLLOWER_STATE_FILE_NAME)
    .length;
}

/** The packument requests sent to the packument queue. */
function queuedRequests(): any[] {
  return mockSQS.commandCalls(SendMessageBatchCommand).flatMap((call) =>
    call.args[0].input.Entries!.map((entry) => ({
      ...JSON.parse(entry.MessageBody!),
      delaySeconds: entry.DelaySeconds,
    }))
  );
}

test('seeds from the legacy marker and queues fresh changes', async () => {
  givenHead(1_010);
  givenNoStateFile();
  givenLegacyMarker(1_000);
  // The scan starts at the seeded marker position and finds one new entry.
  givenChanges(1_000, [change(1_005, 'fresh-package', '3-aaaaaa')], 1_005);

  const before = Date.now();
  await handler(event, context);

  // The follower queues the change for the packument processor, right away.
  const [request] = queuedRequests();
  expect(request).toMatchObject({
    name: 'fresh-package',
    expectedRev: 3,
    seq: 1_005,
    delaySeconds: 0,
  });
  expect(request.reason).toBeUndefined();
  expect(request.firstSeen).toBeGreaterThanOrEqual(before);
  expect(mockSQS).toHaveReceivedCommandWith(SendMessageBatchCommand, {
    QueueUrl: MOCK_PACKUMENT_QUEUE_URL,
  });
  // Entries above the previously covered position are fresh, not late.
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.LATE_CHANGE_COUNT,
    0,
    Unit.Count
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.CHANGE_COUNT,
    1,
    Unit.Count
  );

  const state = savedState();
  expect(state.has(1_005)).toBe(true);
  // A completed scan records a checkpoint at the highest position covered.
  expect(state.newestCheckpointSeq()).toBe(1_010);
  // The first ever scan doubles as a deep scan.
  expect(state.lastDeepScanAt).toBeDefined();
});

test('discovers and queues late-inserted changes', async () => {
  const now = Date.now();
  givenHead(1_000);

  // A completed scan passed seq 500 seven hours ago and seq 1000 five minutes
  // ago. Seq 550 was received; seq 600 was NOT (it appeared in the feed
  // late). Only a regular scan is due.
  const state = new FollowerState();
  state.addCheckpoint(500, now - 7 * HOUR);
  state.addCheckpoint(1_000, now - 5 * 60_000);
  state.addSeqs([550]);
  state.completeDeepScan(now - 2 * HOUR);
  givenStateFile(state);

  // Regular scan: the floor is the checkpoint at (now - window), seq 500.
  givenChanges(
    500,
    [
      change(550, 'already-seen-package'),
      change(600, 'late-package', '2-dddddd'),
    ],
    600
  );

  await handler(event, context);

  // Only the entry without a receipt is queued.
  expect(queuedRequests()).toEqual([
    expect.objectContaining({ name: 'late-package', seq: 600 }),
  ]);
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.LATE_CHANGE_COUNT,
    1,
    Unit.Count
  );
  // The lag is measured against the checkpoint that first crossed seq 600.
  const lagCalls = mockPutMetric.mock.calls.filter(
    ([name]) => name === MetricName.LATE_CHANGE_LAG
  );
  expect(lagCalls).toHaveLength(1);
  expect(lagCalls[0][1]).toBeGreaterThanOrEqual(5 * 60_000);
  expect(lagCalls[0][1]).toBeLessThan(HOUR);

  const saved = savedState();
  expect(saved.has(600)).toBe(true);
  expect(saved.newestCheckpointSeq()).toBe(1_000);
});

test('a failure to queue a chunk leaves its entries without a receipt', async () => {
  givenHead(2_010);
  givenNoStateFile();
  givenLegacyMarker(2_000);
  givenChanges(2_000, [change(2_005, 'some-package')], 2_005);
  mockSQS.on(SendMessageBatchCommand).rejects(new Error('network'));

  await expect(handler(event, context)).rejects.toThrow(/network/);

  // The next run sends the entry again.
  expect(savedState().has(2_005)).toBe(false);
});

test('an entry that announces no revision expects any packument', async () => {
  givenHead(2_010);
  givenNoStateFile();
  givenLegacyMarker(2_000);
  givenChanges(
    2_000,
    [{ seq: 2_005, id: 'no-rev-package', changes: [], deleted: false }],
    2_005
  );

  await handler(event, context);

  expect(queuedRequests()).toEqual([
    expect.objectContaining({ name: 'no-rev-package', expectedRev: 0 }),
  ]);
});

test('ignores change entries for deleted packages, as if they were not in the feed', async () => {
  givenHead(2_010);
  givenNoStateFile();
  givenLegacyMarker(2_000);
  givenChanges(
    2_000,
    [change(2_005, 'deleted-package', '3-aaaaaa', true)],
    2_005
  );

  await handler(event, context);

  // Nothing queued, nothing counted, and no receipt.
  expect(queuedRequests()).toEqual([]);
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.CHANGE_COUNT,
    0,
    Unit.Count
  );
  expect(savedState().has(2_005)).toBe(false);
});

test('seeds at the beginning of the feed on first deployment (automatic backfill)', async () => {
  givenHead(1_010);
  givenNoStateFile();
  // No legacy marker either: this is a brand-new deployment.
  givenChanges(0, [change(1_005, 'historic-package')], 1_005);

  await handler(event, context);

  expect(queuedRequests()).toEqual([
    expect.objectContaining({ name: 'historic-package' }),
  ]);
  const state = savedState();
  expect(state.has(1_005)).toBe(true);
  expect(state.newestCheckpointSeq()).toBe(1_010);
});

test('records interim checkpoints so an interrupted scan resumes mid-window', async () => {
  const now = Date.now();
  givenHead(50_000);

  // A backfill in progress: the last interim checkpoint is at seq 0, and the
  // first full page of the window has already been received (receipts exist).
  const seqs = Array.from({ length: 10_000 }, (_, i) => (i + 1) * 2);
  const state = new FollowerState();
  state.addCheckpoint(0, now - 5 * 60_000);
  state.addSeqs(seqs);
  givenStateFile(state);

  // The first page is full (10,000 entries, all receipted), so the scan wants
  // to continue - but the time budget runs out right after this page.
  let remaining = 300_000;
  (context as any).getRemainingTimeInMillis = () => remaining;
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '10000', since: '0' })
    .reply(200, () => {
      remaining = 30_000; // exhaust the budget after this page
      return {
        results: seqs.map((seq) => change(seq, `package-${seq}`)),
        last_seq: 20_000,
      };
    });

  try {
    await handler(event, context);
  } finally {
    (context as any).getRemainingTimeInMillis = () => 300_000;
  }

  // Everything was receipted, so nothing was queued. The interim checkpoint
  // was recorded, so the next run resumes from seq 20000 instead of the floor.
  expect(mockSQS).not.toHaveReceivedCommand(SendMessageBatchCommand);
  const saved = savedState();
  expect(saved.newestCheckpointSeq()).toBe(20_000);
  // The interrupted (deep) scan did not complete.
  expect(saved.lastDeepScanAt).toBeUndefined();
});

test('persists its state even when the scan fails part-way', async () => {
  givenHead(1_010);
  givenNoStateFile();
  givenLegacyMarker(1_000);

  // The feed itself rejects the request: the scan throws. (A client error
  // is used so the request is not retried until the transient-error deadline.)
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '10000', since: '1000' })
    .reply(403, 'forbidden');

  await expect(handler(event, context)).rejects.toThrow(/HTTP 403/);

  // The state (here: the seeded checkpoint) was saved regardless.
  expect(savedState().newestCheckpointSeq()).toBe(1_000);
});

test('persists its progress after every chunk', async () => {
  givenHead(20_000);
  givenNoStateFile();
  givenLegacyMarker(1_000);

  // 1,500 unreceipted entries: two chunks of work.
  const entries = Array.from({ length: 1_500 }, (_, i) =>
    change(1_001 + i, `bulk-package-${i}`)
  );
  givenChanges(1_000, entries, 2_500);

  await handler(event, context);

  // One state save per chunk (2), plus the final save.
  expect(statePutCount()).toBeGreaterThanOrEqual(3);
  expect(queuedRequests()).toHaveLength(1_500);
  const state = savedState();
  expect(state.has(1_001)).toBe(true);
  expect(state.has(2_500)).toBe(true);
});

test('stops between chunks when the time budget is exhausted, keeping completed chunks', async () => {
  givenHead(20_000);
  givenNoStateFile();
  givenLegacyMarker(1_000);

  const entries = Array.from({ length: 1_500 }, (_, i) =>
    change(1_001 + i, `bulk-package-${i}`)
  );
  givenChanges(1_000, entries, 2_500);

  // Exhaust the budget as soon as the first chunk persists.
  let remaining = 300_000;
  (context as any).getRemainingTimeInMillis = () => remaining;
  mockS3.on(PutObjectCommand).callsFake(() => {
    remaining = 30_000;
    return {};
  });

  try {
    await handler(event, context);
  } finally {
    (context as any).getRemainingTimeInMillis = () => 300_000;
  }

  // The first chunk (1,000 entries) was queued and persisted; the second
  // was not: its entries carry no receipt and no checkpoint moved past them.
  expect(queuedRequests()).toHaveLength(1_000);
  const state = savedState();
  expect(state.has(1_001)).toBe(true);
  expect(state.has(2_000)).toBe(true);
  expect(state.has(2_001)).toBe(false);
  expect(state.newestCheckpointSeq()).toBe(1_000);
});

test('resets its position when the feed head regresses below the newest checkpoint', async () => {
  const now = Date.now();
  // The feed head (3000) is below our newest checkpoint (5000).
  givenHead(3_000);

  const state = new FollowerState();
  state.addCheckpoint(5_000, now - 5 * 60_000);
  state.addSeqs([4_500]);
  state.completeDeepScan(now - HOUR);
  givenStateFile(state);

  // After the reset, the scan starts from the new head.
  givenChanges(3_000, [], 3_000);

  await handler(event, context);

  expect(mockSQS).not.toHaveReceivedCommand(SendMessageBatchCommand);
  const saved = savedState();
  expect(saved.newestCheckpointSeq()).toBe(3_000);
  expect(saved.has(4_500)).toBe(false);
});
