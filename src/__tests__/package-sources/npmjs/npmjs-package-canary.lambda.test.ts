import type { metricScope, MetricsLogger } from 'aws-embedded-metrics';
import { Unit } from 'aws-embedded-metrics';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { S3_CLIENT } from '../../../backend/shared/aws.lambda-shared';
import type { requireEnv } from '../../../backend/shared/env.lambda-shared';
import {
  MetricName,
  Environment,
} from '../../../package-sources/npmjs/canary/constants';

jest.mock('aws-embedded-metrics');
jest.mock('../../../backend/shared/env.lambda-shared');

jest.setTimeout(10_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockMetricScope = require('aws-embedded-metrics')
  .metricScope as jest.MockedFunction<typeof metricScope>;

const mockPutMetric = jest
  .fn()
  .mockName('MetricsLogger.putMetric') as jest.MockedFunction<
  MetricsLogger['putMetric']
>;
const mockSetProperty = jest.fn().mockName('MetricsLogger.setProperty');
const mockMetrics: MetricsLogger = {
  putMetric: mockPutMetric,
  setDimensions: jest.fn(),
  setProperty: mockSetProperty,
} as any;
mockMetricScope.mockImplementation((cb) => {
  const impl = cb(mockMetrics);
  return async (...args: any[]) => impl(...args);
});

const s3Mock = mockClient(S3_CLIENT);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
  .requireEnv as jest.MockedFunction<typeof requireEnv>;

const PACKAGE_NAME = 'construct-hub-probe';
const BUCKET_NAME = 'test-bucket';
const BASE_URL = 'https://constructs.dev';

beforeEach(() => {
  s3Mock.reset();
  mockPutMetric.mockClear();
  mockSetProperty.mockClear();

  mockRequireEnv.mockImplementation((name) => {
    if (name === Environment.PACKAGE_NAME) return PACKAGE_NAME;
    if (name === Environment.PACKAGE_CANARY_BUCKET_NAME) return BUCKET_NAME;
    if (name === Environment.CONSTRUCT_HUB_BASE_URL) return BASE_URL;
    throw new Error(`Unexpected env: ${name}`);
  });
});

const {
  CanaryStateService,
  handler,
} = require('../../../package-sources/npmjs/canary/npmjs-package-canary.lambda'); // eslint-disable-line @typescript-eslint/no-require-imports

describe('TimeSinceLastPublish metric', () => {
  test('is emitted on every invocation based on latest publishedAt', async () => {
    const publishedAt = new Date(Date.now() - 3 * 3600_000); // 3 hours ago

    jest.spyOn(CanaryStateService.prototype, 'latest').mockResolvedValue({
      version: '1.0.0',
      publishedAt,
    });
    jest
      .spyOn(CanaryStateService.prototype, 'isNpmReplicaDown')
      .mockResolvedValue(false);
    jest
      .spyOn(CanaryStateService.prototype, 'save')
      .mockResolvedValue(undefined);

    // Existing state: same version, already available (no pending versions)
    jest.spyOn(CanaryStateService.prototype, 'load').mockResolvedValue({
      latest: { version: '1.0.0', publishedAt, availableAt: publishedAt },
      pending: {},
    });

    await handler({});

    // Verify TimeSinceLastPublish was emitted
    const calls = mockPutMetric.mock.calls.filter(
      ([name]: any) => name === MetricName.TIME_SINCE_LAST_PUBLISH
    );
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toBe(Unit.Seconds);

    // Value should be approximately 3 hours in seconds (within 60s tolerance)
    const value = calls[0][1] as number;
    expect(value).toBeGreaterThan(3 * 3600 - 60);
    expect(value).toBeLessThan(3 * 3600 + 60);

    // DwellTime should NOT be emitted (version is already available)
    const dwellCalls = mockPutMetric.mock.calls.filter(
      ([name]: any) => name === MetricName.DWELL_TIME
    );
    expect(dwellCalls).toHaveLength(0);
  });

  test('is emitted even when there are pending versions', async () => {
    const latestPublishedAt = new Date(Date.now() - 1 * 3600_000); // 1 hour ago
    const oldPublishedAt = new Date(Date.now() - 5 * 3600_000); // 5 hours ago

    jest.spyOn(CanaryStateService.prototype, 'latest').mockResolvedValue({
      version: '2.0.0',
      publishedAt: latestPublishedAt,
    });
    jest
      .spyOn(CanaryStateService.prototype, 'isNpmReplicaDown')
      .mockResolvedValue(false);
    jest
      .spyOn(CanaryStateService.prototype, 'save')
      .mockResolvedValue(undefined);

    // State has old version already available, so updateLatestIfNeeded will
    // promote 2.0.0 to latest. The old 1.0.0 is already resolved so it won't
    // go to pending.
    jest.spyOn(CanaryStateService.prototype, 'load').mockResolvedValue({
      latest: {
        version: '1.0.0',
        publishedAt: oldPublishedAt,
        availableAt: oldPublishedAt,
      },
      pending: {},
    });

    await handler({});

    // TimeSinceLastPublish should reflect the NEW latest (2.0.0)
    const calls = mockPutMetric.mock.calls.filter(
      ([name]: any) => name === MetricName.TIME_SINCE_LAST_PUBLISH
    );
    expect(calls).toHaveLength(1);

    // Should be ~1 hour (the new latest's publishedAt), not ~5 hours
    const value = calls[0][1] as number;
    expect(value).toBeGreaterThan(1 * 3600 - 60);
    expect(value).toBeLessThan(1 * 3600 + 60);
  });
});
