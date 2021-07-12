import { EventEmitter } from 'events';
import type { createGunzip } from 'zlib';
import { Assembly, SchemaVersion } from '@jsii/spec';
import type { metricScope, MetricsLogger } from 'aws-embedded-metrics';
import { Context, SQSEvent } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import type { extract, Headers } from 'tar-stream';
import { MetricName } from '../../../backend/ingestion/constants';
import { reset } from '../../../backend/shared/aws.lambda-shared';
import * as constants from '../../../backend/shared/constants';
import type { requireEnv } from '../../../backend/shared/env.lambda-shared';

jest.mock('zlib');
jest.mock('aws-embedded-metrics');
jest.mock('tar-stream');
jest.mock('../../../backend/shared/env.lambda-shared');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockMetricScope = require('aws-embedded-metrics').metricScope as jest.MockedFunction<typeof metricScope>;
const mockPutMetric = jest.fn().mockName('MetricsLogger.putMetric') as jest.MockedFunction<MetricsLogger['putMetric']>;
const mockMetrics: MetricsLogger = {
  putMetric: mockPutMetric,
  setDimensions: (...args: any[]) => expect(args).toEqual([]),
} as any;
mockMetricScope.mockImplementation((cb) => {
  const impl = cb(mockMetrics);
  return async (...args) => impl(...args);
});

beforeEach((done) => {
  AWSMock.setSDKInstance(AWS);
  done();
});

afterEach((done) => {
  AWSMock.restore();
  reset();
  done();
});

test('basic happy case', async () => {
  const mockBucketName = 'fake-bucket';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared').requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeTarGz = Buffer.from('fake-tarball-content[gzipped]');
  const fakeTar = Buffer.from('fake-tarball-content');
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const integrity = 'sha256-1RyNs3cDpyTqBMqJIiHbCpl8PEN6h3uWx3lzF+3qcmY=';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(fakeAssembly(packageName, packageVersion, packageLicense));

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(stagingBucket);
      expect(req.Key).toBe(stagingKey);
      expect(req.VersionId).toBe(stagingVersion);
    } catch (e) {
      return cb(e);
    }
    return cb(null, { Body: fakeTarGz });
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockCreateGunzip = require('zlib').createGunzip as jest.MockedFunction<typeof createGunzip>;
  mockCreateGunzip.mockImplementation(() => new FakeGunzip(fakeTarGz, fakeTar) as any);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockExtract = require('tar-stream').extract as jest.MockedFunction<typeof extract>;
  mockExtract.mockImplementation(() => new FakeExtract(fakeTar, {
    'package/.jsii': fakeDotJsii,
    'package/index.js': '// Ignore me!',
    'package/package.json': JSON.stringify({ name: packageName, version: packageVersion, license: packageLicense }),
  }) as any);

  let mockTarballCreated = false;
  let mockMetadataCreated = false;
  const assemblyKey = `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.ASSEMBLY_KEY_SUFFIX}`;
  const metadataKey = `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.METADATA_KEY_SUFFIX}`;
  const packageKey = `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.PACKAGE_KEY_SUFFIX}`;
  AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
      expect(req.Metadata?.['Lambda-Log-Group']).toBe(context.logGroupName);
      expect(req.Metadata?.['Lambda-Log-Stream']).toBe(context.logStreamName);
      expect(req.Metadata?.['Lambda-Run-Id']).toBe(context.awsRequestId);
      switch (req.Key) {
        case assemblyKey:
          expect(req.ContentType).toBe('application/json');
          expect(req.Body).toEqual(Buffer.from(fakeDotJsii));
          // Must be created strictly after the tarball and metadata files have been uploaded.
          expect(mockTarballCreated && mockMetadataCreated).toBeTruthy();
          break;
        case metadataKey:
          expect(req.ContentType).toBe('application/json');
          expect(Buffer.from(req.Body!)).toEqual(Buffer.from(JSON.stringify({ date: time })));
          mockMetadataCreated = true;
          break;
        case packageKey:
          expect(req.ContentType).toBe('application/x-gtar');
          expect(req.Body).toEqual(fakeTarGz);
          mockTarballCreated = true;
          break;
        default:
          fail(`Unexpected key: "${req.Key}"`);
      }
    } catch (e) {
      return cb(e);
    }
    return cb(null, { VersionId: `${req.Key}-NewVersion` });
  });

  const event: SQSEvent = {
    Records: [{
      attributes: {} as any,
      awsRegion: 'test-bermuda-1',
      body: JSON.stringify({ tarballUri, integrity, time }),
      eventSource: 'sqs',
      eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
      md5OfBody: 'Fake-MD5-Of-Body',
      messageAttributes: {},
      messageId: 'Fake-Message-ID',
      receiptHandle: 'Fake-Receipt-Handke',
    }],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  await expect(require('../../../backend/ingestion/ingestion.lambda').handler(event, context))
    .resolves.toEqual([{
      bucket: mockBucketName,
      assembly: { key: `${assemblyKey}`, versionId: `${assemblyKey}-NewVersion` },
      metadata: { key: `${metadataKey}`, versionId: `${metadataKey}-NewVersion` },
      package: { key: `${packageKey}`, versionId: `${packageKey}-NewVersion` },
    }]);

  expect(mockPutMetric).toHaveBeenCalledWith(MetricName.MISMATCHED_IDENTITY_REJECTIONS, 0, 'Count');
  expect(mockPutMetric).toHaveBeenCalledWith(MetricName.FOUND_LICENSE_FILE, 0, 'Count');
});

test('basic happy case with license file', async () => {
  const mockBucketName = 'fake-bucket';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared').requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeTarGz = Buffer.from('fake-tarball-content[gzipped]');
  const fakeTar = Buffer.from('fake-tarball-content');
  const fakeLicense = 'inscrutable-legalese';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const integrity = 'sha256-1RyNs3cDpyTqBMqJIiHbCpl8PEN6h3uWx3lzF+3qcmY=';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(fakeAssembly(packageName, packageVersion, packageLicense));

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(stagingBucket);
      expect(req.Key).toBe(stagingKey);
      expect(req.VersionId).toBe(stagingVersion);
    } catch (e) {
      return cb(e);
    }
    return cb(null, { Body: fakeTarGz });
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockCreateGunzip = require('zlib').createGunzip as jest.MockedFunction<typeof createGunzip>;
  mockCreateGunzip.mockImplementation(() => new FakeGunzip(fakeTarGz, fakeTar) as any);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockExtract = require('tar-stream').extract as jest.MockedFunction<typeof extract>;
  mockExtract.mockImplementation(() => new FakeExtract(fakeTar, {
    'package/.jsii': fakeDotJsii,
    'package/LICENSE.md': fakeLicense,
    'package/index.js': '// Ignore me!',
    'package/package.json': JSON.stringify({ name: packageName, version: packageVersion, license: packageLicense }),
  }) as any);

  let mockTarballCreated = false;
  let mockMetadataCreated = false;
  const assemblyKey = `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.ASSEMBLY_KEY_SUFFIX}`;
  const metadataKey = `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.METADATA_KEY_SUFFIX}`;
  const packageKey = `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.PACKAGE_KEY_SUFFIX}`;
  AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
      expect(req.Metadata?.['Lambda-Log-Group']).toBe(context.logGroupName);
      expect(req.Metadata?.['Lambda-Log-Stream']).toBe(context.logStreamName);
      expect(req.Metadata?.['Lambda-Run-Id']).toBe(context.awsRequestId);
      switch (req.Key) {
        case assemblyKey:
          expect(req.ContentType).toBe('application/json');
          expect(req.Body).toEqual(Buffer.from(fakeDotJsii));
          // Must be created strictly after the tarball and metadata files have been uploaded.
          expect(mockTarballCreated && mockMetadataCreated).toBeTruthy();
          break;
        case metadataKey:
          expect(req.ContentType).toBe('application/json');
          expect(Buffer.from(req.Body!)).toEqual(Buffer.from(JSON.stringify({ date: time, licenseText: fakeLicense })));
          mockMetadataCreated = true;
          break;
        case packageKey:
          expect(req.ContentType).toBe('application/x-gtar');
          expect(req.Body).toEqual(fakeTarGz);
          mockTarballCreated = true;
          break;
        default:
          fail(`Unexpected key: "${req.Key}"`);
      }
    } catch (e) {
      return cb(e);
    }
    return cb(null, { VersionId: `${req.Key}-NewVersion` });
  });

  const event: SQSEvent = {
    Records: [{
      attributes: {} as any,
      awsRegion: 'test-bermuda-1',
      body: JSON.stringify({ tarballUri, integrity, time }),
      eventSource: 'sqs',
      eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
      md5OfBody: 'Fake-MD5-Of-Body',
      messageAttributes: {},
      messageId: 'Fake-Message-ID',
      receiptHandle: 'Fake-Receipt-Handke',
    }],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  await expect(require('../../../backend/ingestion/ingestion.lambda').handler(event, context))
    .resolves.toEqual([{
      bucket: mockBucketName,
      assembly: { key: `${assemblyKey}`, versionId: `${assemblyKey}-NewVersion` },
      metadata: { key: `${metadataKey}`, versionId: `${metadataKey}-NewVersion` },
      package: { key: `${packageKey}`, versionId: `${packageKey}-NewVersion` },
    }]);

  expect(mockPutMetric).toHaveBeenCalledWith(MetricName.MISMATCHED_IDENTITY_REJECTIONS, 0, 'Count');
  expect(mockPutMetric).toHaveBeenCalledWith(MetricName.FOUND_LICENSE_FILE, 1, 'Count');
});

test('mismatched package name', async () => {
  const mockBucketName = 'fake-bucket';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared').requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeTarGz = Buffer.from('fake-tarball-content[gzipped]');
  const fakeTar = Buffer.from('fake-tarball-content');
  const fakeLicense = 'inscrutable-legalese';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const integrity = 'sha256-1RyNs3cDpyTqBMqJIiHbCpl8PEN6h3uWx3lzF+3qcmY=';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(fakeAssembly(packageName + '-oops', packageVersion, packageLicense));

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(stagingBucket);
      expect(req.Key).toBe(stagingKey);
      expect(req.VersionId).toBe(stagingVersion);
    } catch (e) {
      return cb(e);
    }
    return cb(null, { Body: fakeTarGz });
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockCreateGunzip = require('zlib').createGunzip as jest.MockedFunction<typeof createGunzip>;
  mockCreateGunzip.mockImplementation(() => new FakeGunzip(fakeTarGz, fakeTar) as any);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockExtract = require('tar-stream').extract as jest.MockedFunction<typeof extract>;
  mockExtract.mockImplementation(() => new FakeExtract(fakeTar, {
    'package/.jsii': fakeDotJsii,
    'package/LICENSE.md': fakeLicense,
    'package/index.js': '// Ignore me!',
    'package/package.json': JSON.stringify({ name: packageName, version: packageVersion, license: packageLicense }),
  }) as any);

  const event: SQSEvent = {
    Records: [{
      attributes: {} as any,
      awsRegion: 'test-bermuda-1',
      body: JSON.stringify({ tarballUri, integrity, time }),
      eventSource: 'sqs',
      eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
      md5OfBody: 'Fake-MD5-Of-Body',
      messageAttributes: {},
      messageId: 'Fake-Message-ID',
      receiptHandle: 'Fake-Receipt-Handke',
    }],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  await expect(require('../../../backend/ingestion/ingestion.lambda').handler(event, context))
    .resolves.toEqual([]);

  expect(mockPutMetric).toHaveBeenCalledWith(MetricName.MISMATCHED_IDENTITY_REJECTIONS, 1, 'Count');
});

test('mismatched package version', async () => {
  const mockBucketName = 'fake-bucket';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared').requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeTarGz = Buffer.from('fake-tarball-content[gzipped]');
  const fakeTar = Buffer.from('fake-tarball-content');
  const fakeLicense = 'inscrutable-legalese';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const integrity = 'sha256-1RyNs3cDpyTqBMqJIiHbCpl8PEN6h3uWx3lzF+3qcmY=';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(fakeAssembly(packageName, packageVersion + '-oops', packageLicense));

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(stagingBucket);
      expect(req.Key).toBe(stagingKey);
      expect(req.VersionId).toBe(stagingVersion);
    } catch (e) {
      return cb(e);
    }
    return cb(null, { Body: fakeTarGz });
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockCreateGunzip = require('zlib').createGunzip as jest.MockedFunction<typeof createGunzip>;
  mockCreateGunzip.mockImplementation(() => new FakeGunzip(fakeTarGz, fakeTar) as any);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockExtract = require('tar-stream').extract as jest.MockedFunction<typeof extract>;
  mockExtract.mockImplementation(() => new FakeExtract(fakeTar, {
    'package/.jsii': fakeDotJsii,
    'package/LICENSE.md': fakeLicense,
    'package/index.js': '// Ignore me!',
    'package/package.json': JSON.stringify({ name: packageName, version: packageVersion, license: packageLicense }),
  }) as any);

  const event: SQSEvent = {
    Records: [{
      attributes: {} as any,
      awsRegion: 'test-bermuda-1',
      body: JSON.stringify({ tarballUri, integrity, time }),
      eventSource: 'sqs',
      eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
      md5OfBody: 'Fake-MD5-Of-Body',
      messageAttributes: {},
      messageId: 'Fake-Message-ID',
      receiptHandle: 'Fake-Receipt-Handke',
    }],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  await expect(require('../../../backend/ingestion/ingestion.lambda').handler(event, context))
    .resolves.toEqual([]);

  expect(mockPutMetric).toHaveBeenCalledWith(MetricName.MISMATCHED_IDENTITY_REJECTIONS, 1, 'Count');
});

test('mismatched package license', async () => {
  const mockBucketName = 'fake-bucket';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared').requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeTarGz = Buffer.from('fake-tarball-content[gzipped]');
  const fakeTar = Buffer.from('fake-tarball-content');
  const fakeLicense = 'inscrutable-legalese';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const integrity = 'sha256-1RyNs3cDpyTqBMqJIiHbCpl8PEN6h3uWx3lzF+3qcmY=';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(fakeAssembly(packageName, packageVersion, packageLicense + '-oops'));

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(stagingBucket);
      expect(req.Key).toBe(stagingKey);
      expect(req.VersionId).toBe(stagingVersion);
    } catch (e) {
      return cb(e);
    }
    return cb(null, { Body: fakeTarGz });
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockCreateGunzip = require('zlib').createGunzip as jest.MockedFunction<typeof createGunzip>;
  mockCreateGunzip.mockImplementation(() => new FakeGunzip(fakeTarGz, fakeTar) as any);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockExtract = require('tar-stream').extract as jest.MockedFunction<typeof extract>;
  mockExtract.mockImplementation(() => new FakeExtract(fakeTar, {
    'package/.jsii': fakeDotJsii,
    'package/LICENSE.md': fakeLicense,
    'package/index.js': '// Ignore me!',
    'package/package.json': JSON.stringify({ name: packageName, version: packageVersion, license: packageLicense }),
  }) as any);

  const event: SQSEvent = {
    Records: [{
      attributes: {} as any,
      awsRegion: 'test-bermuda-1',
      body: JSON.stringify({ tarballUri, integrity, time }),
      eventSource: 'sqs',
      eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
      md5OfBody: 'Fake-MD5-Of-Body',
      messageAttributes: {},
      messageId: 'Fake-Message-ID',
      receiptHandle: 'Fake-Receipt-Handke',
    }],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  await expect(require('../../../backend/ingestion/ingestion.lambda').handler(event, context))
    .resolves.toEqual([]);

  expect(mockPutMetric).toHaveBeenCalledWith(MetricName.MISMATCHED_IDENTITY_REJECTIONS, 1, 'Count');
});

test('missing .jsii file', async () => {
  const mockBucketName = 'fake-bucket';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared').requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeTarGz = Buffer.from('fake-tarball-content[gzipped]');
  const fakeTar = Buffer.from('fake-tarball-content');
  const fakeLicense = 'inscrutable-legalese';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const integrity = 'sha256-1RyNs3cDpyTqBMqJIiHbCpl8PEN6h3uWx3lzF+3qcmY=';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(stagingBucket);
      expect(req.Key).toBe(stagingKey);
      expect(req.VersionId).toBe(stagingVersion);
    } catch (e) {
      return cb(e);
    }
    return cb(null, { Body: fakeTarGz });
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockCreateGunzip = require('zlib').createGunzip as jest.MockedFunction<typeof createGunzip>;
  mockCreateGunzip.mockImplementation(() => new FakeGunzip(fakeTarGz, fakeTar) as any);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockExtract = require('tar-stream').extract as jest.MockedFunction<typeof extract>;
  mockExtract.mockImplementation(() => new FakeExtract(fakeTar, {
    'package/LICENSE.md': fakeLicense,
    'package/index.js': '// Ignore me!',
    'package/package.json': JSON.stringify({ name: packageName, version: packageVersion, license: packageLicense }),
  }) as any);

  const event: SQSEvent = {
    Records: [{
      attributes: {} as any,
      awsRegion: 'test-bermuda-1',
      body: JSON.stringify({ tarballUri, integrity, time }),
      eventSource: 'sqs',
      eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
      md5OfBody: 'Fake-MD5-Of-Body',
      messageAttributes: {},
      messageId: 'Fake-Message-ID',
      receiptHandle: 'Fake-Receipt-Handke',
    }],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  await expect(require('../../../backend/ingestion/ingestion.lambda').handler(event, context))
    .rejects.toThrow(/No \.jsii file found in tarball!/);
});

test('missing package.json file', async () => {
  const mockBucketName = 'fake-bucket';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared').requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeTarGz = Buffer.from('fake-tarball-content[gzipped]');
  const fakeTar = Buffer.from('fake-tarball-content');
  const fakeLicense = 'inscrutable-legalese';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const integrity = 'sha256-1RyNs3cDpyTqBMqJIiHbCpl8PEN6h3uWx3lzF+3qcmY=';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(fakeAssembly(packageName, packageVersion, packageLicense));

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(stagingBucket);
      expect(req.Key).toBe(stagingKey);
      expect(req.VersionId).toBe(stagingVersion);
    } catch (e) {
      return cb(e);
    }
    return cb(null, { Body: fakeTarGz });
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockCreateGunzip = require('zlib').createGunzip as jest.MockedFunction<typeof createGunzip>;
  mockCreateGunzip.mockImplementation(() => new FakeGunzip(fakeTarGz, fakeTar) as any);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockExtract = require('tar-stream').extract as jest.MockedFunction<typeof extract>;
  mockExtract.mockImplementation(() => new FakeExtract(fakeTar, {
    'package/.jsii': fakeDotJsii,
    'package/LICENSE.md': fakeLicense,
    'package/index.js': '// Ignore me!',
  }) as any);

  const event: SQSEvent = {
    Records: [{
      attributes: {} as any,
      awsRegion: 'test-bermuda-1',
      body: JSON.stringify({ tarballUri, integrity, time }),
      eventSource: 'sqs',
      eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
      md5OfBody: 'Fake-MD5-Of-Body',
      messageAttributes: {},
      messageId: 'Fake-Message-ID',
      receiptHandle: 'Fake-Receipt-Handke',
    }],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  await expect(require('../../../backend/ingestion/ingestion.lambda').handler(event, context))
    .rejects.toThrow(/No package\.json file found in tarball!/);
});

type Response<T> = (err: AWS.AWSError | null, data?: T) => void;

class FakeGunzip extends EventEmitter {
  private sent = 0;

  public constructor(private readonly gz: Buffer, private readonly result: Buffer) {
    super();
  }

  public end(data: Buffer): void {
    try {
      expect(data).toEqual(this.gz);
      setImmediate(() => this.sendData());
    } catch (e) {
      this.emit('error', e);
    }
  }

  private sendData() {
    if (this.sent >= this.result.length) {
      this.emit('end');
      return;
    }
    this.emit('data', this.result.slice(this.sent, this.sent + 1));
    this.sent++;
    setImmediate(() => this.sendData());
  }
}

class FakeExtract extends EventEmitter {
  private readonly files: Array<[string, string]>;

  public constructor(private readonly tar: Buffer, files: Record<string, string>) {
    super();
    this.files = Object.entries(files);
  }

  public write(data: Buffer, cb?: (err: Error | null) => void): void {
    try {
      expect(data).toEqual(Buffer.from(this.tar));
      cb?.(null);
      setImmediate(() => this.sendNextEntry());
    } catch (e) {
      cb?.(e);
    }
  }

  public end(): void {
    // no-op
  }

  private sendNextEntry() {
    const nextEntry = this.files.shift();
    if (nextEntry == null) {
      this.emit('finish');
      return;
    }

    const [name, content] = nextEntry;

    const headers: Headers = { name };
    const stream = new FakeStream(Buffer.from(content));
    const next = () => this.sendNextEntry();
    this.emit('entry', headers, stream, next);
  }
}

class FakeStream extends EventEmitter {
  private sent = 0;

  public constructor(private readonly content: Buffer) {
    super();
  }

  public resume() {
    setImmediate(() => this.sendData());
  }

  private sendData() {
    if (this.sent >= this.content.length) {
      this.emit('end');
      return;
    }
    this.emit('data', this.content.slice(this.sent, this.sent + 1));
    this.sent++;
    setImmediate(() => this.sendData());
  }
}

function fakeAssembly(name: string, version: string, license: string): Assembly {
  return {
    schema: SchemaVersion.LATEST,
    name,
    version,
    license,
    homepage: 'https://localhost.fake/repository',
    repository: { url: 'ssh://localhost.fake/repository.git', type: 'git' },
    author: { name: 'ACME', email: 'test@acme', organization: true, roles: ['author'] },
    description: 'This is a fake package assembly',
    jsiiVersion: '0.0.0+head',
    fingerprint: 'NOPE',
  };
}
