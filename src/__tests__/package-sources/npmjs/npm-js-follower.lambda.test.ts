import { gunzipSync } from 'zlib';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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
  FOLLOWER_STATE_FILE_NAME,
  KNOWN_VERSIONS_FILE_NAME,
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
const REGISTRY = 'https://registry.npmjs.org';

const MOCK_BUCKET = 'mock-staging-bucket';
const MOCK_STAGING_FUNCTION = 'mock-staging-function';
const MOCK_DENY_LIST_BUCKET = 'deny-list-bucket-name';
const MOCK_DENY_LIST_OBJECT = 'my-deny-list.json';
const MOCK_LICENSE_LIST_BUCKET = 'license-list-bucket-name';
const MOCK_LICENSE_LIST_OBJECT = 'license-list.json';

const HOUR = 60 * 60 * 1_000;

const mockS3 = mockClient(S3Client);
const mockLambda = mockClient(LambdaClient);

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
  mockPutMetric.mockClear();

  process.env.BUCKET_NAME = MOCK_BUCKET;
  process.env.FUNCTION_NAME = MOCK_STAGING_FUNCTION;
  process.env[ENV_DENY_LIST_BUCKET_NAME] = MOCK_DENY_LIST_BUCKET;
  process.env[ENV_DENY_LIST_OBJECT_KEY] = MOCK_DENY_LIST_OBJECT;
  process.env[LicenseListEnv.BUCKET_NAME] = MOCK_LICENSE_LIST_BUCKET;
  process.env[LicenseListEnv.OBJECT_KEY] = MOCK_LICENSE_LIST_OBJECT;

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
  // No legacy marker by default
  mockS3
    .on(GetObjectCommand, { Bucket: MOCK_BUCKET, Key: MARKER_FILE_NAME })
    .rejects(noSuchKey());

  mockS3.on(PutObjectCommand).resolves({});
  mockLambda.on(InvokeCommand).resolves({ StatusCode: 202 });
});

afterEach(() => {
  delete process.env.BUCKET_NAME;
  delete process.env.FUNCTION_NAME;
  delete process.env[ENV_DENY_LIST_BUCKET_NAME];
  delete process.env[ENV_DENY_LIST_OBJECT_KEY];
  delete process.env[LicenseListEnv.BUCKET_NAME];
  delete process.env[LicenseListEnv.OBJECT_KEY];
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

test('seeds from the legacy marker and processes fresh changes', async () => {
  givenHead(1_010);
  givenNoStateFile();
  givenLegacyMarker(1_000);

  // The scan starts at the seeded marker position and finds one new entry.
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '10000', since: '1000' })
    .reply(200, {
      results: [
        {
          seq: 1_005,
          id: 'fresh-package',
          changes: [{ rev: '1-aaaaaa' }],
          deleted: false,
        },
      ],
      last_seq: 1_005,
    });
  nock(REGISTRY)
    .get('/fresh-package')
    .reply(200, packageDoc('fresh-package', '1-aaaaaa', '1.0.0'));

  await handler(event, context);

  expect(stagedPackages()).toEqual([
    { name: 'fresh-package', version: '1.0.0' },
  ]);
  // Entries above the previously covered position are fresh, not late.
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.LATE_CHANGE_COUNT,
    0,
    Unit.Count
  );

  const state = savedState();
  expect(state.has(1_005)).toBe(true);
  // A completed scan records a checkpoint at the highest position covered.
  expect(state.newestCheckpointSeq()).toBe(1_010);
  // The first ever scan doubles as a deep scan.
  expect(state.lastDeepScanAt).toBeDefined();
});

test('discovers and stages late-inserted changes', async () => {
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

  // Regular scan: floor is the checkpoint at/bordering (now - window), i.e.
  // seq 500. Only the late entry's packument may be fetched.
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
      last_seq: 600,
    });
  nock(REGISTRY)
    .get('/late-package')
    .reply(200, packageDoc('late-package', '2-dddddd', '1.2.3'));

  await handler(event, context);

  expect(stagedPackages()).toEqual([
    { name: 'late-package', version: '1.2.3' },
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

test('laggy packument: processes served versions and records the expectation', async () => {
  givenHead(2_010);
  givenNoStateFile();
  givenLegacyMarker(2_000);

  // The feed announces rev 5, but the registry only serves rev 3.
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '10000', since: '2000' })
    .reply(200, {
      results: [
        {
          seq: 2_005,
          id: 'laggy-package',
          changes: [{ rev: '5-eeeeee' }],
          deleted: false,
        },
      ],
      last_seq: 2_005,
    });
  nock(REGISTRY)
    .get('/laggy-package')
    .reply(200, packageDoc('laggy-package', '3-ffffff', '1.0.0'));

  await handler(event, context);

  // The versions the registry did serve are processed anyway.
  expect(stagedPackages()).toEqual([
    { name: 'laggy-package', version: '1.0.0' },
  ]);
  // ... and the expectation of rev 5 is recorded for later re-checks.
  const state = savedState();
  expect(state.laggyPackuments()).toEqual([
    expect.objectContaining({
      name: 'laggy-package',
      expectedRev: 5,
      seq: 2_005,
    }),
  ]);
});

test('laggy packument: recovered once the registry catches up', async () => {
  const now = Date.now();
  givenHead(3_000);

  const state = new FollowerState();
  state.addCheckpoint(3_000, now - 5 * 60_000);
  state.completeDeepScan(now - HOUR);
  state.recordLaggyPackument('recovered-package', 4, 1_500, now - HOUR);
  givenStateFile(state);

  // The registry has now caught up (rev 4 >= expected 4), serving a version
  // we don't know yet.
  nock(REGISTRY)
    .get('/recovered-package')
    .reply(200, packageDoc('recovered-package', '4-gggggg', '2.0.0'));
  // The scan itself is empty.
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '10000', since: '3000' })
    .reply(200, { results: [], last_seq: 3_000 });

  await handler(event, context);

  expect(stagedPackages()).toEqual([
    { name: 'recovered-package', version: '2.0.0' },
  ]);
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.LAGGY_PACKUMENTS_RECOVERED,
    1,
    Unit.Count
  );
  expect(savedState().laggyPackumentCount).toBe(0);
});

test('laggy packument: gives up after the maximum age, still processing what is served', async () => {
  const now = Date.now();
  givenHead(3_000);

  const state = new FollowerState();
  state.addCheckpoint(3_000, now - 5 * 60_000);
  state.completeDeepScan(now - HOUR);
  // First seen 25 hours ago: beyond the give-up age.
  state.recordLaggyPackument('stuck-package', 9, 1_600, now - 25 * HOUR);
  givenStateFile(state);

  // The registry still serves rev 7 < expected 9 - but with a version we
  // don't know, which is processed regardless.
  nock(REGISTRY)
    .get('/stuck-package')
    .reply(200, packageDoc('stuck-package', '7-hhhhhh', '3.0.0'));
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '10000', since: '3000' })
    .reply(200, { results: [], last_seq: 3_000 });

  await handler(event, context);

  expect(stagedPackages()).toEqual([
    { name: 'stuck-package', version: '3.0.0' },
  ]);
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.LAGGY_PACKUMENT_GIVE_UPS,
    1,
    Unit.Count
  );
  expect(savedState().laggyPackumentCount).toBe(0);
});

test('seeds at the beginning of the feed on first deployment (automatic backfill)', async () => {
  givenHead(1_010);
  givenNoStateFile();
  // No legacy marker either: this is a brand-new deployment.

  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '10000', since: '0' })
    .reply(200, {
      results: [
        {
          seq: 1_005,
          id: 'historic-package',
          changes: [{ rev: '1-bbbbbb' }],
          deleted: false,
        },
      ],
      last_seq: 1_005,
    });
  nock(REGISTRY)
    .get('/historic-package')
    .reply(200, packageDoc('historic-package', '1-bbbbbb', '1.0.0'));

  await handler(event, context);

  expect(stagedPackages()).toEqual([
    { name: 'historic-package', version: '1.0.0' },
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
        results: seqs.map((seq) => ({
          seq,
          id: `package-${seq}`,
          changes: [{ rev: '1-aaaaaa' }],
          deleted: false,
        })),
        last_seq: 20_000,
      };
    });

  try {
    await handler(event, context);
  } finally {
    (context as any).getRemainingTimeInMillis = () => 300_000;
  }

  // Nothing needed staging (everything was receipted), and no packument was
  // fetched (no registry nock exists). The interim checkpoint was recorded,
  // so the next run resumes from seq 20000 instead of the floor.
  expect(mockLambda).not.toHaveReceivedCommand(InvokeCommand);
  const saved = savedState();
  expect(saved.newestCheckpointSeq()).toBe(20_000);
  // The interrupted (deep) scan did not complete.
  expect(saved.lastDeepScanAt).toBeUndefined();
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
  nock(REPLICA)
    .get('/registry/_changes')
    .query({ limit: '10000', since: '3000' })
    .reply(200, { results: [], last_seq: 3_000 });

  await handler(event, context);

  expect(mockLambda).not.toHaveReceivedCommand(InvokeCommand);
  const saved = savedState();
  expect(saved.newestCheckpointSeq()).toBe(3_000);
  expect(saved.has(4_500)).toBe(false);
});
