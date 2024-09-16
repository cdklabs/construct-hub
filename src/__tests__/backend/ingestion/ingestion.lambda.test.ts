import { createGzip, gzipSync } from 'zlib';
import {
  GetObjectCommand,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import {
  Assembly,
  CollectionKind,
  DependencyConfiguration,
  PrimitiveType,
  SchemaVersion,
  SPEC_FILE_NAME,
  SPEC_FILE_NAME_COMPRESSED,
  Stability,
  TypeKind,
} from '@jsii/spec';
import { StreamingBlobPayloadOutputTypes } from '@smithy/types';
import { sdkStreamMixin } from '@smithy/util-stream';
import type { metricScope, MetricsLogger } from 'aws-embedded-metrics';
import { Context, SQSEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { pack } from 'tar-stream';
import { MetricName } from '../../../backend/ingestion/constants';
import * as constants from '../../../backend/shared/constants';
import type { requireEnv } from '../../../backend/shared/env.lambda-shared';
import { integrity as computeIntegrity } from '../../../backend/shared/integrity.lambda-shared';
import { TagCondition } from '../../../package-tag';
import { stringToStream } from '../../streams';

jest.setTimeout(10_000);

jest.mock('aws-embedded-metrics');
jest.mock('../../../backend/shared/env.lambda-shared');
const decoder = new TextDecoder();

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
} as any;
mockMetricScope.mockImplementation((cb) => {
  const impl = cb(mockMetrics);
  return async (...args) => impl(...args);
});

test('basic happy case', async () => {
  const s3Mock = mockClient(S3Client);
  const sfnMock = mockClient(SFNClient);
  const mockBucketName = 'fake-bucket';
  const mockStateMachineArn = 'fake-state-machine-arn';
  const mockConfigBucket = 'fake-config-bucket';
  const mockConfigkey = 'fake-config-obj-key';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
    .requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    if (name === 'STATE_MACHINE_ARN') {
      return mockStateMachineArn;
    }
    if (name === 'CONFIG_BUCKET_NAME') {
      return mockConfigBucket;
    }
    if (name === 'CONFIG_FILE_KEY') {
      return mockConfigkey;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(
    fakeAssembly(packageName, packageVersion, packageLicense)
  );
  const mockConfig = JSON.stringify({
    packageLinks: [],
    packageTags: [],
  });

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  const makeTarball = async () =>
    buildTarGz({
      [`package/${SPEC_FILE_NAME}`]: fakeDotJsii,
      'package/index.js': '// Ignore me!',
      'package/package.json': JSON.stringify({
        name: packageName,
        version: packageVersion,
        license: packageLicense,
      }),
    });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockConfigBucket,
      Key: mockConfigkey,
    })
    .resolves({ Body: stringToStream(mockConfig) });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: stagingBucket,
      Key: stagingKey,
      VersionId: stagingVersion,
    })
    .resolves({ Body: await makeTarball() });

  let mockTarballCreated = false;
  let mockMetadataCreated = false;
  const { assemblyKey, metadataKey, packageKey } = constants.getObjectKeys(
    packageName,
    packageVersion
  );

  s3Mock.on(PutObjectCommand).callsFake(async (req: PutObjectCommandInput) => {
    expect(req.Bucket).toBe(mockBucketName);
    expect(req.Metadata?.['Lambda-Log-Group']).toBe(context.logGroupName);
    expect(req.Metadata?.['Lambda-Log-Stream']).toBe(context.logStreamName);
    expect(req.Metadata?.['Lambda-Run-Id']).toBe(context.awsRequestId);
    switch (req.Key) {
      case assemblyKey:
        expect(req.ContentType).toBe('application/json');

        // our service removes the "types" field from the assembly since it is not needed
        // and takes up a lot of space.
        assertAssembly(fakeDotJsii, decoder.decode(req.Body! as Uint8Array));

        // Must be created strictly after the tarball and metadata files have been uploaded.
        expect(mockTarballCreated && mockMetadataCreated).toBeTruthy();
        break;
      case metadataKey:
        expect(req.ContentType).toBe('application/json');
        expect(typeof req.Body).toBe('string');
        expect(JSON.parse(req.Body! as string)).toEqual({
          constructFrameworks: [],
          date: time,
          packageLinks: {},
          packageTags: [],
        });
        mockMetadataCreated = true;
        break;
      case packageKey:
        expect(req.ContentType).toBe('application/octet-stream');
        expect(req.Body).toEqual(
          await makeTarball().then((tb) => tb.transformToByteArray())
        );
        mockTarballCreated = true;
        break;
      default:
        fail(`Unexpected key: "${req.Key}"`);
    }
    return { VersionId: `${req.Key}-NewVersion` };
  });

  const executionArn = 'Fake-Execution-Arn';
  sfnMock.on(StartExecutionCommand).callsFake((req) => {
    expect(req.stateMachineArn).toBe(mockStateMachineArn);
    expect(JSON.parse(req.input!)).toEqual({
      bucket: mockBucketName,
      assembly: {
        key: assemblyKey,
        versionId: `${assemblyKey}-NewVersion`,
      },
      metadata: {
        key: metadataKey,
        versionId: `${metadataKey}-NewVersion`,
      },
      package: { key: packageKey, versionId: `${packageKey}-NewVersion` },
    });

    return { executionArn, startDate: new Date() };
  });

  const event: SQSEvent = {
    Records: [
      {
        attributes: {} as any,
        awsRegion: 'test-bermuda-1',
        body: JSON.stringify({
          tarballUri,
          integrity: computeIntegrity(
            { metadata: {}, tarballUri, time },
            await makeTarball().then((t) => t.transformToByteArray())
          ).integrity,
          time,
        }),
        eventSource: 'sqs',
        eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
        md5OfBody: 'Fake-MD5-Of-Body',
        messageAttributes: {},
        messageId: 'Fake-Message-ID',
        receiptHandle: 'Fake-Receipt-Handke',
      },
    ],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //

  await expect(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../backend/ingestion/ingestion.lambda').handler(
      event,
      context
    )
  ).resolves.toEqual([executionArn]);

  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.MISMATCHED_IDENTITY_REJECTIONS,
    0,
    'Count'
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.FOUND_LICENSE_FILE,
    0,
    'Count'
  );
});

test('basic happy case with duplicated packages', async () => {
  const s3Mock = mockClient(S3Client);
  const sfnMock = mockClient(SFNClient);
  const mockBucketName = 'fake-bucket';
  const mockStateMachineArn = 'fake-state-machine-arn';
  const mockConfigBucket = 'fake-config-bucket';
  const mockConfigkey = 'fake-config-obj-key';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
    .requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    if (name === 'STATE_MACHINE_ARN') {
      return mockStateMachineArn;
    }
    if (name === 'CONFIG_BUCKET_NAME') {
      return mockConfigBucket;
    }
    if (name === 'CONFIG_FILE_KEY') {
      return mockConfigkey;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(
    fakeAssembly(packageName, packageVersion, packageLicense)
  );
  const mockConfig = JSON.stringify({
    packageLinks: [],
    packageTags: [],
  });

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  const makeTarball = async () =>
    buildTarGz({
      [`package/${SPEC_FILE_NAME}`]: fakeDotJsii,
      'package/index.js': '// Ignore me!',
      'package/package.json': JSON.stringify({
        name: packageName,
        version: packageVersion,
        license: packageLicense,
      }),
    });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockConfigBucket,
      Key: mockConfigkey,
    })
    .resolves({ Body: stringToStream(mockConfig) });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: stagingBucket,
      Key: stagingKey,
      VersionId: stagingVersion,
    })
    .callsFake(async () => {
      return { Body: await makeTarball() };
    });

  let mockTarballCreated = false;
  let mockMetadataCreated = false;
  const { assemblyKey, metadataKey, packageKey } = constants.getObjectKeys(
    packageName,
    packageVersion
  );

  s3Mock.on(PutObjectCommand).callsFake(async (req: PutObjectCommandInput) => {
    expect(req.Bucket).toBe(mockBucketName);
    expect(req.Metadata?.['Lambda-Log-Group']).toBe(context.logGroupName);
    expect(req.Metadata?.['Lambda-Log-Stream']).toBe(context.logStreamName);
    expect(req.Metadata?.['Lambda-Run-Id']).toBe(context.awsRequestId);
    switch (req.Key) {
      case assemblyKey:
        expect(req.ContentType).toBe('application/json');

        // our service removes the "types" field from the assembly since it is not needed
        // and takes up a lot of space.
        assertAssembly(fakeDotJsii, decoder.decode(req.Body! as Uint8Array));

        // Must be created strictly after the tarball and metadata files have been uploaded.
        expect(mockTarballCreated && mockMetadataCreated).toBeTruthy();
        break;
      case metadataKey:
        expect(req.ContentType).toBe('application/json');
        expect(typeof req.Body).toBe('string');
        expect(JSON.parse(req.Body! as string)).toEqual({
          constructFrameworks: [],
          date: time,
          packageLinks: {},
          packageTags: [],
        });
        mockMetadataCreated = true;
        break;
      case packageKey:
        expect(req.ContentType).toBe('application/octet-stream');
        expect(req.Body).toEqual(
          await makeTarball().then((tb) => tb.transformToByteArray())
        );
        mockTarballCreated = true;
        break;
      default:
        fail(`Unexpected key: "${req.Key}"`);
    }
    return { VersionId: `${req.Key}-NewVersion` };
  });

  const executionArn = 'Fake-Execution-Arn';
  sfnMock.on(StartExecutionCommand).callsFake((req) => {
    expect(req.stateMachineArn).toBe(mockStateMachineArn);
    expect(JSON.parse(req.input!)).toEqual({
      bucket: mockBucketName,
      assembly: {
        key: assemblyKey,
        versionId: `${assemblyKey}-NewVersion`,
      },
      metadata: {
        key: metadataKey,
        versionId: `${metadataKey}-NewVersion`,
      },
      package: { key: packageKey, versionId: `${packageKey}-NewVersion` },
    });

    return { executionArn, startDate: new Date() };
  });

  const event: SQSEvent = {
    Records: [
      {
        attributes: {} as any,
        awsRegion: 'test-bermuda-1',
        body: JSON.stringify({
          tarballUri,
          integrity: computeIntegrity(
            { metadata: {}, tarballUri, time },
            await makeTarball().then((t) => t.transformToByteArray())
          ).integrity,
          time,
        }),
        eventSource: 'sqs',
        eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
        md5OfBody: 'Fake-MD5-Of-Body',
        messageAttributes: {},
        messageId: 'Fake-Message-ID1',
        receiptHandle: 'Fake-Receipt-Handke1',
      },
      {
        attributes: {} as any,
        awsRegion: 'test-bermuda-1',
        body: JSON.stringify({
          tarballUri,
          integrity: computeIntegrity(
            { metadata: {}, tarballUri, time },
            await makeTarball().then((t) => t.transformToByteArray())
          ).integrity,
          time,
        }),
        eventSource: 'sqs',
        eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
        md5OfBody: 'Fake-MD5-Of-Body',
        messageAttributes: {},
        messageId: 'Fake-Message-ID2',
        receiptHandle: 'Fake-Receipt-Handke2',
      },
    ],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //

  await expect(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../backend/ingestion/ingestion.lambda').handler(
      event,
      context
    )
  ).resolves.toEqual([executionArn]);

  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.MISMATCHED_IDENTITY_REJECTIONS,
    0,
    'Count'
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.FOUND_LICENSE_FILE,
    0,
    'Count'
  );
});

test('basic happy case with compressed assembly', async () => {
  const s3Mock = mockClient(S3Client);
  const sfnMock = mockClient(SFNClient);
  const mockBucketName = 'fake-bucket';
  const mockStateMachineArn = 'fake-state-machine-arn';
  const mockConfigBucket = 'fake-config-bucket';
  const mockConfigkey = 'fake-config-obj-key';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
    .requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    if (name === 'STATE_MACHINE_ARN') {
      return mockStateMachineArn;
    }
    if (name === 'CONFIG_BUCKET_NAME') {
      return mockConfigBucket;
    }
    if (name === 'CONFIG_FILE_KEY') {
      return mockConfigkey;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(
    fakeAssembly(packageName, packageVersion, packageLicense)
  );
  const fakeDotJsiiRedirect = JSON.stringify({
    schema: 'jsii/file-redirect',
    compression: 'gzip',
    filename: SPEC_FILE_NAME_COMPRESSED,
  });
  const mockConfig = JSON.stringify({
    packageLinks: [],
    packageTags: [],
  });

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  const makeTarball = async () =>
    buildTarGz({
      [`package/${SPEC_FILE_NAME}`]: fakeDotJsiiRedirect,
      [`package/${SPEC_FILE_NAME_COMPRESSED}`]: gzipSync(fakeDotJsii),
      'package/index.js': '// Ignore me!',
      'package/package.json': JSON.stringify({
        name: packageName,
        version: packageVersion,
        license: packageLicense,
      }),
    });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockConfigBucket,
      Key: mockConfigkey,
    })
    .resolves({ Body: stringToStream(mockConfig) });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: stagingBucket,
      Key: stagingKey,
      VersionId: stagingVersion,
    })
    .resolves({ Body: await makeTarball() });

  let mockTarballCreated = false;
  let mockMetadataCreated = false;
  const { assemblyKey, metadataKey, packageKey } = constants.getObjectKeys(
    packageName,
    packageVersion
  );

  s3Mock.on(PutObjectCommand).callsFake(async (req: PutObjectCommandInput) => {
    expect(req.Bucket).toBe(mockBucketName);
    expect(req.Metadata?.['Lambda-Log-Group']).toBe(context.logGroupName);
    expect(req.Metadata?.['Lambda-Log-Stream']).toBe(context.logStreamName);
    expect(req.Metadata?.['Lambda-Run-Id']).toBe(context.awsRequestId);
    switch (req.Key) {
      case assemblyKey:
        expect(req.ContentType).toBe('application/json');

        // our service removes the "types" field from the assembly since it is not needed
        // and takes up a lot of space.
        assertAssembly(fakeDotJsii, decoder.decode(req.Body! as Uint8Array));

        // Must be created strictly after the tarball and metadata files have been uploaded.
        expect(mockTarballCreated && mockMetadataCreated).toBeTruthy();
        break;
      case metadataKey:
        expect(req.ContentType).toBe('application/json');
        expect(typeof req.Body).toBe('string');
        expect(JSON.parse(req.Body! as string)).toEqual({
          constructFrameworks: [],
          date: time,
          packageLinks: {},
          packageTags: [],
        });
        mockMetadataCreated = true;
        break;
      case packageKey:
        expect(req.ContentType).toBe('application/octet-stream');
        expect(req.Body).toEqual(
          await makeTarball().then((tb) => tb.transformToByteArray())
        );
        mockTarballCreated = true;
        break;
      default:
        fail(`Unexpected key: "${req.Key}"`);
    }
    return { VersionId: `${req.Key}-NewVersion` };
  });

  const executionArn = 'Fake-Execution-Arn';
  sfnMock.on(StartExecutionCommand).callsFake((req) => {
    expect(req.stateMachineArn).toBe(mockStateMachineArn);
    expect(JSON.parse(req.input!)).toEqual({
      bucket: mockBucketName,
      assembly: {
        key: assemblyKey,
        versionId: `${assemblyKey}-NewVersion`,
      },
      metadata: {
        key: metadataKey,
        versionId: `${metadataKey}-NewVersion`,
      },
      package: { key: packageKey, versionId: `${packageKey}-NewVersion` },
    });

    return { executionArn, startDate: new Date() };
  });

  const event: SQSEvent = {
    Records: [
      {
        attributes: {} as any,
        awsRegion: 'test-bermuda-1',
        body: JSON.stringify({
          tarballUri,
          integrity: computeIntegrity(
            { metadata: {}, tarballUri, time },
            await makeTarball().then((t) => t.transformToByteArray())
          ).integrity,
          time,
        }),
        eventSource: 'sqs',
        eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
        md5OfBody: 'Fake-MD5-Of-Body',
        messageAttributes: {},
        messageId: 'Fake-Message-ID',
        receiptHandle: 'Fake-Receipt-Handke',
      },
    ],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //
  await expect(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../backend/ingestion/ingestion.lambda').handler(
      event,
      context
    )
  ).resolves.toEqual([executionArn]);

  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.MISMATCHED_IDENTITY_REJECTIONS,
    0,
    'Count'
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.FOUND_LICENSE_FILE,
    0,
    'Count'
  );
});

test('basic happy case with license file', async () => {
  const s3Mock = mockClient(S3Client);
  const sfnMock = mockClient(SFNClient);
  const mockBucketName = 'fake-bucket';
  const mockStateMachineArn = 'fake-state-machine-arn';
  const mockConfigBucket = 'fake-config-bucket';
  const mockConfigkey = 'fake-config-obj-key';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
    .requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    if (name === 'STATE_MACHINE_ARN') {
      return mockStateMachineArn;
    }
    if (name === 'CONFIG_BUCKET_NAME') {
      return mockConfigBucket;
    }
    if (name === 'CONFIG_FILE_KEY') {
      return mockConfigkey;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeLicense = 'inscrutable-legalese';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(
    fakeAssembly(packageName, packageVersion, packageLicense)
  );
  const mockConfig = JSON.stringify({
    packageLinks: [],
    packageTags: [],
  });

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  const makeTarball = async () =>
    buildTarGz({
      [`package/${SPEC_FILE_NAME}`]: fakeDotJsii,
      'package/LICENSE.md': fakeLicense,
      'package/index.js': '// Ignore me!',
      'package/package.json': JSON.stringify({
        name: packageName,
        version: packageVersion,
        license: packageLicense,
      }),
    });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockConfigBucket,
      Key: mockConfigkey,
    })
    .resolves({ Body: stringToStream(mockConfig) });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: stagingBucket,
      Key: stagingKey,
      VersionId: stagingVersion,
    })
    .callsFake(async () => {
      return { Body: await makeTarball() };
    });

  let mockTarballCreated = false;
  let mockMetadataCreated = false;
  const { assemblyKey, metadataKey, packageKey } = constants.getObjectKeys(
    packageName,
    packageVersion
  );

  s3Mock.on(PutObjectCommand).callsFake(async (req: PutObjectCommandInput) => {
    expect(req.Bucket).toBe(mockBucketName);
    expect(req.Metadata?.['Lambda-Log-Group']).toBe(context.logGroupName);
    expect(req.Metadata?.['Lambda-Log-Stream']).toBe(context.logStreamName);
    expect(req.Metadata?.['Lambda-Run-Id']).toBe(context.awsRequestId);
    switch (req.Key) {
      case assemblyKey:
        expect(req.ContentType).toBe('application/json');

        // our service removes the "types" field from the assembly since it is not needed
        // and takes up a lot of space.
        assertAssembly(fakeDotJsii, decoder.decode(req.Body! as Uint8Array));

        // Must be created strictly after the tarball and metadata files have been uploaded.
        expect(mockTarballCreated && mockMetadataCreated).toBeTruthy();
        break;
      case metadataKey:
        expect(req.ContentType).toBe('application/json');
        expect(typeof req.Body).toBe('string');
        expect(JSON.parse(req.Body! as string)).toEqual({
          constructFrameworks: [],
          date: time,
          licenseText: fakeLicense,
          packageLinks: {},
          packageTags: [],
        });
        mockMetadataCreated = true;
        break;
      case packageKey:
        expect(req.ContentType).toBe('application/octet-stream');
        expect(req.Body).toEqual(
          await makeTarball().then((tb) => tb.transformToByteArray())
        );
        mockTarballCreated = true;
        break;
      default:
        fail(`Unexpected key: "${req.Key}"`);
    }
    return { VersionId: `${req.Key}-NewVersion` };
  });

  const executionArn = 'Fake-Execution-Arn';
  sfnMock.on(StartExecutionCommand).callsFake((req) => {
    expect(req.stateMachineArn).toBe(mockStateMachineArn);
    expect(JSON.parse(req.input!)).toEqual({
      bucket: mockBucketName,
      assembly: {
        key: assemblyKey,
        versionId: `${assemblyKey}-NewVersion`,
      },
      metadata: {
        key: metadataKey,
        versionId: `${metadataKey}-NewVersion`,
      },
      package: { key: packageKey, versionId: `${packageKey}-NewVersion` },
    });

    return { executionArn, startDate: new Date() };
  });

  const event: SQSEvent = {
    Records: [
      {
        attributes: {} as any,
        awsRegion: 'test-bermuda-1',
        body: JSON.stringify({
          tarballUri,
          integrity: computeIntegrity(
            { metadata: {}, tarballUri, time },
            await makeTarball().then((t) => t.transformToByteArray())
          ).integrity,
          time,
        }),
        eventSource: 'sqs',
        eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
        md5OfBody: 'Fake-MD5-Of-Body',
        messageAttributes: {},
        messageId: 'Fake-Message-ID',
        receiptHandle: 'Fake-Receipt-Handke',
      },
    ],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //
  await expect(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../backend/ingestion/ingestion.lambda').handler(
      event,
      context
    )
  ).resolves.toEqual([executionArn]);

  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.MISMATCHED_IDENTITY_REJECTIONS,
    0,
    'Count'
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.FOUND_LICENSE_FILE,
    1,
    'Count'
  );
});

test('basic happy case with custom package links', async () => {
  const s3Mock = mockClient(S3Client);
  const sfnMock = mockClient(SFNClient);
  const mockBucketName = 'fake-bucket';
  const mockStateMachineArn = 'fake-state-machine-arn';
  const mockConfigBucket = 'fake-config-bucket';
  const mockConfigkey = 'fake-config-obj-key';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
    .requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    if (name === 'STATE_MACHINE_ARN') {
      return mockStateMachineArn;
    }
    if (name === 'CONFIG_BUCKET_NAME') {
      return mockConfigBucket;
    }
    if (name === 'CONFIG_FILE_KEY') {
      return mockConfigkey;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const packageLinkValue = 'https://somehost.com';
  const packageLinkBadValue = 'https://somebadhost.com';
  const fakeDotJsii = JSON.stringify(
    fakeAssembly(packageName, packageVersion, packageLicense)
  );
  const mockConfig = JSON.stringify({
    packageLinks: [],
    packageTags: [],
  });

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  const makeTarball = async () =>
    buildTarGz({
      [`package/${SPEC_FILE_NAME}`]: fakeDotJsii,
      'package/index.js': '// Ignore me!',
      'package/package.json': JSON.stringify({
        name: packageName,
        version: packageVersion,
        license: packageLicense,
        constructHub: {
          packageLinks: {
            PackageLinkKey: packageLinkValue,
            PackageLinkDomainKey: packageLinkValue,
            PackageLinkBadDomainKey: packageLinkBadValue,
          },
        },
      }),
    });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockConfigBucket,
      Key: mockConfigkey,
    })
    .resolves({ Body: stringToStream(mockConfig) });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: stagingBucket,
      Key: stagingKey,
      VersionId: stagingVersion,
    })
    .resolves({ Body: await makeTarball() });

  let mockTarballCreated = false;
  let mockMetadataCreated = false;
  const { assemblyKey, metadataKey, packageKey } = constants.getObjectKeys(
    packageName,
    packageVersion
  );

  s3Mock.on(PutObjectCommand).callsFake(async (req: PutObjectCommandInput) => {
    expect(req.Bucket).toBe(mockBucketName);
    expect(req.Metadata?.['Lambda-Log-Group']).toBe(context.logGroupName);
    expect(req.Metadata?.['Lambda-Log-Stream']).toBe(context.logStreamName);
    expect(req.Metadata?.['Lambda-Run-Id']).toBe(context.awsRequestId);
    switch (req.Key) {
      case assemblyKey:
        expect(req.ContentType).toBe('application/json');

        // our service removes the "types" field from the assembly since it is not needed
        // and takes up a lot of space.
        assertAssembly(fakeDotJsii, decoder.decode(req.Body! as Uint8Array));

        // Must be created strictly after the tarball and metadata files have been uploaded.
        expect(mockTarballCreated && mockMetadataCreated).toBeTruthy();
        break;
      case metadataKey:
        expect(req.ContentType).toBe('application/json');
        expect(typeof req.Body).toBe('string');
        expect(JSON.parse(req.Body! as string)).toEqual({
          constructFrameworks: [],
          date: time,
          packageLinks: {},
          packageTags: [],
        });
        mockMetadataCreated = true;
        break;
      case packageKey:
        expect(req.ContentType).toBe('application/octet-stream');
        expect(req.Body).toEqual(
          await makeTarball().then((tb) => tb.transformToByteArray())
        );
        mockTarballCreated = true;
        break;
      default:
        fail(`Unexpected key: "${req.Key}"`);
    }
    return { VersionId: `${req.Key}-NewVersion` };
  });

  const executionArn = 'Fake-Execution-Arn';
  sfnMock.on(StartExecutionCommand).callsFake((req) => {
    expect(req.stateMachineArn).toBe(mockStateMachineArn);
    expect(JSON.parse(req.input!)).toEqual({
      bucket: mockBucketName,
      assembly: {
        key: assemblyKey,
        versionId: `${assemblyKey}-NewVersion`,
      },
      metadata: {
        key: metadataKey,
        versionId: `${metadataKey}-NewVersion`,
      },
      package: { key: packageKey, versionId: `${packageKey}-NewVersion` },
    });

    return { executionArn, startDate: new Date() };
  });

  const event: SQSEvent = {
    Records: [
      {
        attributes: {} as any,
        awsRegion: 'test-bermuda-1',
        body: JSON.stringify({
          tarballUri,
          integrity: computeIntegrity(
            { metadata: {}, tarballUri, time },
            await makeTarball().then((t) => t.transformToByteArray())
          ).integrity,
          time,
        }),
        eventSource: 'sqs',
        eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
        md5OfBody: 'Fake-MD5-Of-Body',
        messageAttributes: {},
        messageId: 'Fake-Message-ID',
        receiptHandle: 'Fake-Receipt-Handke',
      },
    ],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //
  await expect(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../backend/ingestion/ingestion.lambda').handler(
      event,
      context
    )
  ).resolves.toEqual([executionArn]);

  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.MISMATCHED_IDENTITY_REJECTIONS,
    0,
    'Count'
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.FOUND_LICENSE_FILE,
    0,
    'Count'
  );
});

test('basic happy case with custom tags', async () => {
  const s3Mock = mockClient(S3Client);
  const sfnMock = mockClient(SFNClient);
  const mockBucketName = 'fake-bucket';
  const mockStateMachineArn = 'fake-state-machine-arn';
  const mockConfigBucket = 'fake-config-bucket';
  const mockConfigkey = 'fake-config-obj-key';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
    .requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    if (name === 'STATE_MACHINE_ARN') {
      return mockStateMachineArn;
    }
    if (name === 'CONFIG_BUCKET_NAME') {
      return mockConfigBucket;
    }
    if (name === 'CONFIG_FILE_KEY') {
      return mockConfigkey;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(
    fakeAssembly(packageName, packageVersion, packageLicense)
  );

  // Some true and false tags to assert against in output
  const mockTrueCondition = TagCondition.field('name').eq(packageName);
  const mockFalseCondition = TagCondition.field('name').eq('BadPackageName');

  // Combinations of conditions that resolve to true, tags should be included
  // in output with label `true_${key}`.
  const trueTags = {
    basic: mockTrueCondition,
    or: TagCondition.or(mockTrueCondition, mockFalseCondition),
    and: TagCondition.and(mockTrueCondition, mockTrueCondition),
    not: TagCondition.not(mockFalseCondition),
    readme: TagCondition.readme().includes('Foo'),
  };

  // Combinations of conditions that resolve to false, tags should not be
  // included in output.
  const falseTags = {
    basic: mockFalseCondition,
    or: TagCondition.or(mockFalseCondition, mockFalseCondition),
    and: TagCondition.and(mockTrueCondition, mockFalseCondition),
    not: TagCondition.not(mockTrueCondition),
    readme: TagCondition.readme().includes('foo', { caseSensitive: true }),
  };

  // Useful for later since we need this ordered array to assert against
  const trueEntries = Object.entries(trueTags);
  const tagMaker = (prefix: string, tags: [string, TagCondition][]) =>
    tags.map(([key, cond]: [string, TagCondition]) => ({
      condition: cond.bind(),
      label: `${prefix}_${key}`,
    }));

  const mockPackageTags = [
    ...tagMaker('true', trueEntries),
    ...tagMaker('false', Object.entries(falseTags)),
  ];

  const mockConfig = JSON.stringify({
    packageLinks: [],
    packageTags: mockPackageTags,
  });

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  const makeTarball = async () =>
    buildTarGz({
      [`package/${SPEC_FILE_NAME}`]: fakeDotJsii,
      'package/index.js': '// Ignore me!',
      'package/package.json': JSON.stringify({
        name: packageName,
        version: packageVersion,
        license: packageLicense,
      }),
    });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockConfigBucket,
      Key: mockConfigkey,
    })
    .resolves({ Body: stringToStream(mockConfig) });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: stagingBucket,
      Key: stagingKey,
      VersionId: stagingVersion,
    })
    .resolves({ Body: await makeTarball() });

  let mockTarballCreated = false;
  let mockMetadataCreated = false;
  const { assemblyKey, metadataKey, packageKey } = constants.getObjectKeys(
    packageName,
    packageVersion
  );

  s3Mock.on(PutObjectCommand).callsFake(async (req: PutObjectCommandInput) => {
    expect(req.Bucket).toBe(mockBucketName);
    expect(req.Metadata?.['Lambda-Log-Group']).toBe(context.logGroupName);
    expect(req.Metadata?.['Lambda-Log-Stream']).toBe(context.logStreamName);
    expect(req.Metadata?.['Lambda-Run-Id']).toBe(context.awsRequestId);
    switch (req.Key) {
      case assemblyKey:
        expect(req.ContentType).toBe('application/json');
        assertAssembly(fakeDotJsii, decoder.decode(req.Body! as Uint8Array));

        // Must be created strictly after the tarball and metadata files have been uploaded.
        expect(mockTarballCreated && mockMetadataCreated).toBeTruthy();
        break;
      case metadataKey:
        expect(req.ContentType).toBe('application/json');
        expect(typeof req.Body).toBe('string');
        expect(JSON.parse(req.Body! as string)).toEqual({
          constructFrameworks: [],
          date: time,
          packageLinks: {},
          // only includes true tags
          packageTags: trueEntries.map(([name]) => ({
            label: `true_${name}`,
          })),
        });
        mockMetadataCreated = true;
        break;
      case packageKey:
        expect(req.ContentType).toBe('application/octet-stream');
        expect(req.Body).toEqual(
          await makeTarball().then((tb) => tb.transformToByteArray())
        );
        mockTarballCreated = true;
        break;
      default:
        fail(`Unexpected key: "${req.Key}"`);
    }
    return { VersionId: `${req.Key}-NewVersion` };
  });

  const executionArn = 'Fake-Execution-Arn';
  sfnMock.on(StartExecutionCommand).callsFake((req) => {
    expect(req.stateMachineArn).toBe(mockStateMachineArn);
    expect(JSON.parse(req.input!)).toEqual({
      bucket: mockBucketName,
      assembly: {
        key: assemblyKey,
        versionId: `${assemblyKey}-NewVersion`,
      },
      metadata: {
        key: metadataKey,
        versionId: `${metadataKey}-NewVersion`,
      },
      package: { key: packageKey, versionId: `${packageKey}-NewVersion` },
    });

    return { executionArn, startDate: new Date() };
  });

  const event: SQSEvent = {
    Records: [
      {
        attributes: {} as any,
        awsRegion: 'test-bermuda-1',
        body: JSON.stringify({
          tarballUri,
          integrity: computeIntegrity(
            { metadata: {}, tarballUri, time },
            await makeTarball().then((t) => t.transformToByteArray())
          ).integrity,
          time,
        }),
        eventSource: 'sqs',
        eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
        md5OfBody: 'Fake-MD5-Of-Body',
        messageAttributes: {},
        messageId: 'Fake-Message-ID',
        receiptHandle: 'Fake-Receipt-Handke',
      },
    ],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //

  await expect(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../backend/ingestion/ingestion.lambda').handler(
      event,
      context
    )
  ).resolves.toEqual([executionArn]);

  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.MISMATCHED_IDENTITY_REJECTIONS,
    0,
    'Count'
  );
  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.FOUND_LICENSE_FILE,
    0,
    'Count'
  );
});

for (const [frameworkName, frameworkPackage] of [
  ['aws-cdk', '@aws-cdk/core'],
  ['aws-cdk', 'aws-cdk-lib'],
  ['cdk8s', 'cdk8s'],
  ['cdktf', 'cdktf'],
]) {
  test(`basic happy case with constructs framework (${frameworkName})`, async () => {
    const s3Mock = mockClient(S3Client);
    const sfnMock = mockClient(SFNClient);
    const mockBucketName = 'fake-bucket';
    const mockStateMachineArn = 'fake-state-machine-arn';
    const mockConfigBucket = 'fake-config-bucket';
    const mockConfigkey = 'fake-config-obj-key';

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
      .requireEnv as jest.MockedFunction<typeof requireEnv>;
    mockRequireEnv.mockImplementation((name) => {
      if (name === 'BUCKET_NAME') {
        return mockBucketName;
      }
      if (name === 'STATE_MACHINE_ARN') {
        return mockStateMachineArn;
      }
      if (name === 'CONFIG_BUCKET_NAME') {
        return mockConfigBucket;
      }
      if (name === 'CONFIG_FILE_KEY') {
        return mockConfigkey;
      }
      throw new Error(`Bad environment variable: "${name}"`);
    });

    const stagingBucket = 'staging-bucket';
    const stagingKey = 'staging-key';
    const stagingVersion = 'staging-version-id';
    const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
    const time = '2021-07-12T15:18:00.000000+02:00';
    const packageName = '@package-scope/package-name';
    const packageVersion = '1.2.3-pre.4';
    const packageLicense = 'Apache-2.0';
    const fakeDotJsii = JSON.stringify({
      ...fakeAssembly(packageName, packageVersion, packageLicense),
      dependencies: { [frameworkPackage]: '^1337.234.567' },
      dependencyClosure: {
        [frameworkPackage]: {
          /* ... */
        },
      },
    });
    const mockConfig = JSON.stringify({
      packageLinks: [],
      packageTags: [],
    });

    const context: Context = {
      awsRequestId: 'Fake-Request-ID',
      logGroupName: 'Fake-Log-Group',
      logStreamName: 'Fake-Log-Stream',
    } as any;

    const makeTarball = async () =>
      buildTarGz({
        [`package/${SPEC_FILE_NAME}`]: fakeDotJsii,
        'package/index.js': '// Ignore me!',
        'package/package.json': JSON.stringify({
          name: packageName,
          version: packageVersion,
          license: packageLicense,
        }),
      });

    s3Mock
      .on(GetObjectCommand, {
        Bucket: mockConfigBucket,
        Key: mockConfigkey,
      })
      .resolves({ Body: stringToStream(mockConfig) });

    s3Mock
      .on(GetObjectCommand, {
        Bucket: stagingBucket,
        Key: stagingKey,
        VersionId: stagingVersion,
      })
      .resolves({ Body: await makeTarball() });

    let mockTarballCreated = false;
    let mockMetadataCreated = false;
    const { assemblyKey, metadataKey, packageKey } = constants.getObjectKeys(
      packageName,
      packageVersion
    );

    s3Mock
      .on(PutObjectCommand)
      .callsFake(async (req: PutObjectCommandInput) => {
        expect(req.Bucket).toBe(mockBucketName);
        expect(req.Metadata?.['Lambda-Log-Group']).toBe(context.logGroupName);
        expect(req.Metadata?.['Lambda-Log-Stream']).toBe(context.logStreamName);
        expect(req.Metadata?.['Lambda-Run-Id']).toBe(context.awsRequestId);
        switch (req.Key) {
          case assemblyKey:
            expect(req.ContentType).toBe('application/json');
            assertAssembly(
              fakeDotJsii,
              decoder.decode(req.Body! as Uint8Array)
            );

            // Must be created strictly after the tarball and metadata files have been uploaded.
            expect(mockTarballCreated && mockMetadataCreated).toBeTruthy();
            break;
          case metadataKey:
            expect(req.ContentType).toBe('application/json');
            expect(typeof req.Body).toBe('string');
            expect(JSON.parse(req.Body!.toString('utf-8'))).toEqual({
              constructFrameworks: [
                { name: frameworkName, majorVersion: 1337 },
              ],
              date: time,
              packageLinks: {},
              packageTags: [],
            });
            mockMetadataCreated = true;
            break;
          case packageKey:
            expect(req.ContentType).toBe('application/octet-stream');
            expect(req.Body).toEqual(
              await makeTarball().then((tb) => tb.transformToByteArray())
            );
            mockTarballCreated = true;
            break;
          default:
            fail(`Unexpected key: "${req.Key}"`);
        }
        return { VersionId: `${req.Key}-NewVersion` };
      });

    const executionArn = 'Fake-Execution-Arn';
    sfnMock.on(StartExecutionCommand).callsFake((req) => {
      expect(req.stateMachineArn).toBe(mockStateMachineArn);
      expect(JSON.parse(req.input!)).toEqual({
        bucket: mockBucketName,
        assembly: {
          key: assemblyKey,
          versionId: `${assemblyKey}-NewVersion`,
        },
        metadata: {
          key: metadataKey,
          versionId: `${metadataKey}-NewVersion`,
        },
        package: { key: packageKey, versionId: `${packageKey}-NewVersion` },
      });

      return { executionArn, startDate: new Date() };
    });

    const event: SQSEvent = {
      Records: [
        {
          attributes: {} as any,
          awsRegion: 'test-bermuda-1',
          body: JSON.stringify({
            tarballUri,
            integrity: computeIntegrity(
              { metadata: {}, tarballUri, time },
              await makeTarball().then((t) => t.transformToByteArray())
            ).integrity,
            time,
          }),
          eventSource: 'sqs',
          eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
          md5OfBody: 'Fake-MD5-Of-Body',
          messageAttributes: {},
          messageId: 'Fake-Message-ID',
          receiptHandle: 'Fake-Receipt-Handke',
        },
      ],
    };

    await expect(
      // We require the handler here so that any mocks to metricScope are set up
      // prior to the handler being created.
      //
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../../backend/ingestion/ingestion.lambda').handler(
        event,
        context
      )
    ).resolves.toEqual([executionArn]);

    expect(mockPutMetric).toHaveBeenCalledWith(
      MetricName.MISMATCHED_IDENTITY_REJECTIONS,
      0,
      'Count'
    );
    expect(mockPutMetric).toHaveBeenCalledWith(
      MetricName.FOUND_LICENSE_FILE,
      0,
      'Count'
    );
  });

  test(`the construct framework package itself (${frameworkPackage} => ${frameworkName})`, async () => {
    const s3Mock = mockClient(S3Client);
    const sfnMock = mockClient(SFNClient);
    const mockBucketName = 'fake-bucket';
    const mockStateMachineArn = 'fake-state-machine-arn';
    const mockConfigBucket = 'fake-config-bucket';
    const mockConfigkey = 'fake-config-obj-key';

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
      .requireEnv as jest.MockedFunction<typeof requireEnv>;
    mockRequireEnv.mockImplementation((name) => {
      if (name === 'BUCKET_NAME') {
        return mockBucketName;
      }
      if (name === 'STATE_MACHINE_ARN') {
        return mockStateMachineArn;
      }
      if (name === 'CONFIG_BUCKET_NAME') {
        return mockConfigBucket;
      }
      if (name === 'CONFIG_FILE_KEY') {
        return mockConfigkey;
      }
      throw new Error(`Bad environment variable: "${name}"`);
    });

    const stagingBucket = 'staging-bucket';
    const stagingKey = 'staging-key';
    const stagingVersion = 'staging-version-id';
    const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
    const time = '2021-07-12T15:18:00.000000+02:00';
    const packageVersion = '42.2.3-pre.4';
    const packageLicense = 'Apache-2.0';
    const fakeDotJsii = JSON.stringify(
      fakeAssembly(frameworkPackage, packageVersion, packageLicense)
    );
    const mockConfig = JSON.stringify({
      packageLinks: [],
      packageTags: [],
    });

    const context: Context = {
      awsRequestId: 'Fake-Request-ID',
      logGroupName: 'Fake-Log-Group',
      logStreamName: 'Fake-Log-Stream',
    } as any;

    const makeTarball = async () =>
      buildTarGz({
        [`package/${SPEC_FILE_NAME}`]: fakeDotJsii,
        'package/index.js': '// Ignore me!',
        'package/package.json': JSON.stringify({
          name: frameworkPackage,
          version: packageVersion,
          license: packageLicense,
        }),
      });

    s3Mock
      .on(GetObjectCommand, {
        Bucket: mockConfigBucket,
        Key: mockConfigkey,
      })
      .resolves({ Body: stringToStream(mockConfig) });

    s3Mock
      .on(GetObjectCommand, {
        Bucket: stagingBucket,
        Key: stagingKey,
        VersionId: stagingVersion,
      })
      .resolves({ Body: await makeTarball() });

    let mockTarballCreated = false;
    let mockMetadataCreated = false;
    const { assemblyKey, metadataKey, packageKey } = constants.getObjectKeys(
      frameworkPackage,
      packageVersion
    );

    s3Mock
      .on(PutObjectCommand)
      .callsFake(async (req: PutObjectCommandInput) => {
        expect(req.Bucket).toBe(mockBucketName);
        expect(req.Metadata?.['Lambda-Log-Group']).toBe(context.logGroupName);
        expect(req.Metadata?.['Lambda-Log-Stream']).toBe(context.logStreamName);
        expect(req.Metadata?.['Lambda-Run-Id']).toBe(context.awsRequestId);
        switch (req.Key) {
          case assemblyKey:
            expect(req.ContentType).toBe('application/json');
            assertAssembly(
              fakeDotJsii,
              decoder.decode(req.Body! as Uint8Array)
            );

            // Must be created strictly after the tarball and metadata files have been uploaded.
            expect(mockTarballCreated && mockMetadataCreated).toBeTruthy();
            break;
          case metadataKey:
            expect(req.ContentType).toBe('application/json');
            expect(typeof req.Body).toBe('string');
            expect(JSON.parse(req.Body! as string)).toEqual({
              constructFrameworks: [{ name: frameworkName, majorVersion: 42 }],
              date: time,
              packageLinks: {},
              packageTags: [],
            });
            mockMetadataCreated = true;
            break;
          case packageKey:
            expect(req.ContentType).toBe('application/octet-stream');
            expect(req.Body).toEqual(
              await makeTarball().then((tb) => tb.transformToByteArray())
            );
            mockTarballCreated = true;
            break;
          default:
            fail(`Unexpected key: "${req.Key}"`);
        }
        return { VersionId: `${req.Key}-NewVersion` };
      });

    const executionArn = 'Fake-Execution-Arn';
    sfnMock.on(StartExecutionCommand).callsFake((req) => {
      expect(req.stateMachineArn).toBe(mockStateMachineArn);
      expect(JSON.parse(req.input!)).toEqual({
        bucket: mockBucketName,
        assembly: {
          key: assemblyKey,
          versionId: `${assemblyKey}-NewVersion`,
        },
        metadata: {
          key: metadataKey,
          versionId: `${metadataKey}-NewVersion`,
        },
        package: { key: packageKey, versionId: `${packageKey}-NewVersion` },
      });

      return { executionArn, startDate: new Date() };
    });

    const event: SQSEvent = {
      Records: [
        {
          attributes: {} as any,
          awsRegion: 'test-bermuda-1',
          body: JSON.stringify({
            tarballUri,
            integrity: computeIntegrity(
              { metadata: {}, tarballUri, time },
              await makeTarball().then((t) => t.transformToByteArray())
            ).integrity,
            time,
          }),
          eventSource: 'sqs',
          eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
          md5OfBody: 'Fake-MD5-Of-Body',
          messageAttributes: {},
          messageId: 'Fake-Message-ID',
          receiptHandle: 'Fake-Receipt-Handke',
        },
      ],
    };

    await expect(
      // We require the handler here so that any mocks to metricScope are set up
      // prior to the handler being created.
      //
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../../backend/ingestion/ingestion.lambda').handler(
        event,
        context
      )
    ).resolves.toEqual([executionArn]);

    expect(mockPutMetric).toHaveBeenCalledWith(
      MetricName.MISMATCHED_IDENTITY_REJECTIONS,
      0,
      'Count'
    );
    expect(mockPutMetric).toHaveBeenCalledWith(
      MetricName.FOUND_LICENSE_FILE,
      0,
      'Count'
    );
  });

  test(`basic happy case with constructs framework (${frameworkName}), no major`, async () => {
    const s3Mock = mockClient(S3Client);
    const sfnMock = mockClient(SFNClient);
    const mockBucketName = 'fake-bucket';
    const mockStateMachineArn = 'fake-state-machine-arn';
    const mockConfigBucket = 'fake-config-bucket';
    const mockConfigkey = 'fake-config-obj-key';

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
      .requireEnv as jest.MockedFunction<typeof requireEnv>;
    mockRequireEnv.mockImplementation((name) => {
      if (name === 'BUCKET_NAME') {
        return mockBucketName;
      }
      if (name === 'STATE_MACHINE_ARN') {
        return mockStateMachineArn;
      }
      if (name === 'CONFIG_BUCKET_NAME') {
        return mockConfigBucket;
      }
      if (name === 'CONFIG_FILE_KEY') {
        return mockConfigkey;
      }
      throw new Error(`Bad environment variable: "${name}"`);
    });

    const stagingBucket = 'staging-bucket';
    const stagingKey = 'staging-key';
    const stagingVersion = 'staging-version-id';
    const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
    const time = '2021-07-12T15:18:00.000000+02:00';
    const packageName = '@package-scope/package-name';
    const packageVersion = '1.2.3-pre.4';
    const packageLicense = 'Apache-2.0';
    const fakeDotJsii = JSON.stringify({
      ...fakeAssembly(packageName, packageVersion, packageLicense),
      // Not in the `dependencies` closure (e.g: transitive only), so we cannot
      // determine which major version of the framework is being used here.
      dependencyClosure: {
        [frameworkPackage]: {
          /* ... */
        },
      },
    });
    const mockConfig = JSON.stringify({
      packageLinks: [],
      packageTags: [],
    });

    const context: Context = {
      awsRequestId: 'Fake-Request-ID',
      logGroupName: 'Fake-Log-Group',
      logStreamName: 'Fake-Log-Stream',
    } as any;

    const makeTarball = async () =>
      buildTarGz({
        [`package/${SPEC_FILE_NAME}`]: fakeDotJsii,
        'package/index.js': '// Ignore me!',
        'package/package.json': JSON.stringify({
          name: packageName,
          version: packageVersion,
          license: packageLicense,
        }),
      });

    s3Mock
      .on(GetObjectCommand, {
        Bucket: mockConfigBucket,
        Key: mockConfigkey,
      })
      .resolves({ Body: stringToStream(mockConfig) });

    s3Mock
      .on(GetObjectCommand, {
        Bucket: stagingBucket,
        Key: stagingKey,
        VersionId: stagingVersion,
      })
      .resolves({ Body: await makeTarball() });

    let mockTarballCreated = false;
    let mockMetadataCreated = false;
    const { assemblyKey, metadataKey, packageKey } = constants.getObjectKeys(
      packageName,
      packageVersion
    );

    s3Mock
      .on(PutObjectCommand)
      .callsFake(async (req: PutObjectCommandInput) => {
        expect(req.Bucket).toBe(mockBucketName);
        expect(req.Metadata?.['Lambda-Log-Group']).toBe(context.logGroupName);
        expect(req.Metadata?.['Lambda-Log-Stream']).toBe(context.logStreamName);
        expect(req.Metadata?.['Lambda-Run-Id']).toBe(context.awsRequestId);
        switch (req.Key) {
          case assemblyKey:
            expect(req.ContentType).toBe('application/json');

            // our service removes the "types" field from the assembly since it is not needed
            // and takes up a lot of space.
            assertAssembly(
              fakeDotJsii,
              decoder.decode(req.Body! as Uint8Array)
            );

            // Must be created strictly after the tarball and metadata files have been uploaded.
            expect(mockTarballCreated && mockMetadataCreated).toBeTruthy();
            break;
          case metadataKey:
            expect(req.ContentType).toBe('application/json');
            expect(typeof req.Body).toBe('string');
            expect(JSON.parse(req.Body! as string)).toEqual({
              constructFrameworks: [{ name: frameworkName }], // No major version here (intentional)
              date: time,
              packageLinks: {},
              packageTags: [],
            });
            mockMetadataCreated = true;
            break;
          case packageKey:
            expect(req.ContentType).toBe('application/octet-stream');
            expect(req.Body).toEqual(
              await makeTarball().then((tb) => tb.transformToByteArray())
            );
            mockTarballCreated = true;
            break;
          default:
            fail(`Unexpected key: "${req.Key}"`);
        }
        return { VersionId: `${req.Key}-NewVersion` };
      });

    const executionArn = 'Fake-Execution-Arn';
    sfnMock.on(StartExecutionCommand).callsFake((req) => {
      expect(req.stateMachineArn).toBe(mockStateMachineArn);
      expect(JSON.parse(req.input!)).toEqual({
        bucket: mockBucketName,
        assembly: {
          key: assemblyKey,
          versionId: `${assemblyKey}-NewVersion`,
        },
        metadata: {
          key: metadataKey,
          versionId: `${metadataKey}-NewVersion`,
        },
        package: { key: packageKey, versionId: `${packageKey}-NewVersion` },
      });

      return { executionArn, startDate: new Date() };
    });

    const event: SQSEvent = {
      Records: [
        {
          attributes: {} as any,
          awsRegion: 'test-bermuda-1',
          body: JSON.stringify({
            tarballUri,
            integrity: computeIntegrity(
              { metadata: {}, tarballUri, time },
              await makeTarball().then((t) => t.transformToByteArray())
            ).integrity,
            time,
          }),
          eventSource: 'sqs',
          eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
          md5OfBody: 'Fake-MD5-Of-Body',
          messageAttributes: {},
          messageId: 'Fake-Message-ID',
          receiptHandle: 'Fake-Receipt-Handke',
        },
      ],
    };

    await expect(
      // We require the handler here so that any mocks to metricScope are set up
      // prior to the handler being created.
      //
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../../backend/ingestion/ingestion.lambda').handler(
        event,
        context
      )
    ).resolves.toEqual([executionArn]);

    expect(mockPutMetric).toHaveBeenCalledWith(
      MetricName.MISMATCHED_IDENTITY_REJECTIONS,
      0,
      'Count'
    );
    expect(mockPutMetric).toHaveBeenCalledWith(
      MetricName.FOUND_LICENSE_FILE,
      0,
      'Count'
    );
  });
}

test('mismatched package name', async () => {
  const s3Mock = mockClient(S3Client);
  const mockBucketName = 'fake-bucket';
  const mockStateMachineArn = 'fake-state-machine-arn';
  const mockConfigBucket = 'fake-config-bucket';
  const mockConfigkey = 'fake-config-obj-key';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
    .requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    if (name === 'STATE_MACHINE_ARN') {
      return mockStateMachineArn;
    }
    if (name === 'CONFIG_BUCKET_NAME') {
      return mockConfigBucket;
    }
    if (name === 'CONFIG_FILE_KEY') {
      return mockConfigkey;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeLicense = 'inscrutable-legalese';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(
    fakeAssembly(packageName + '-oops', packageVersion, packageLicense)
  );
  const mockConfig = JSON.stringify({
    packageLinks: [],
    packageTags: [],
  });

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  const makeTarball = async () =>
    buildTarGz({
      [`package/${SPEC_FILE_NAME}`]: fakeDotJsii,
      'package/LICENSE.md': fakeLicense,
      'package/index.js': '// Ignore me!',
      'package/package.json': JSON.stringify({
        name: packageName,
        version: packageVersion,
        license: packageLicense,
      }),
    });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockConfigBucket,
      Key: mockConfigkey,
    })
    .resolves({ Body: stringToStream(mockConfig) });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: stagingBucket,
      Key: stagingKey,
      VersionId: stagingVersion,
    })
    .resolves({ Body: await makeTarball() });

  const event: SQSEvent = {
    Records: [
      {
        attributes: {} as any,
        awsRegion: 'test-bermuda-1',
        body: JSON.stringify({
          tarballUri,
          integrity: computeIntegrity(
            { metadata: {}, tarballUri, time },
            await makeTarball().then((t) => t.transformToByteArray())
          ).integrity,
          time,
        }),
        eventSource: 'sqs',
        eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
        md5OfBody: 'Fake-MD5-Of-Body',
        messageAttributes: {},
        messageId: 'Fake-Message-ID',
        receiptHandle: 'Fake-Receipt-Handke',
      },
    ],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //
  await expect(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../backend/ingestion/ingestion.lambda').handler(
      event,
      context
    )
  ).resolves.toEqual([]);

  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.MISMATCHED_IDENTITY_REJECTIONS,
    1,
    'Count'
  );
});

test('mismatched package version', async () => {
  const s3Mock = mockClient(S3Client);
  const mockBucketName = 'fake-bucket';
  const mockStateMachineArn = 'fake-state-machine-arn';
  const mockConfigBucket = 'fake-config-bucket';
  const mockConfigkey = 'fake-config-obj-key';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
    .requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    if (name === 'STATE_MACHINE_ARN') {
      return mockStateMachineArn;
    }
    if (name === 'CONFIG_BUCKET_NAME') {
      return mockConfigBucket;
    }
    if (name === 'CONFIG_FILE_KEY') {
      return mockConfigkey;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeLicense = 'inscrutable-legalese';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(
    fakeAssembly(packageName, packageVersion + '-oops', packageLicense)
  );
  const mockConfig = JSON.stringify({
    packageLinks: [],
    packageTags: [],
  });

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  const makeTarball = async () =>
    buildTarGz({
      [`package/${SPEC_FILE_NAME}`]: fakeDotJsii,
      'package/LICENSE.md': fakeLicense,
      'package/index.js': '// Ignore me!',
      'package/package.json': JSON.stringify({
        name: packageName,
        version: packageVersion,
        license: packageLicense,
      }),
    });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockConfigBucket,
      Key: mockConfigkey,
    })
    .resolves({ Body: stringToStream(mockConfig) });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: stagingBucket,
      Key: stagingKey,
      VersionId: stagingVersion,
    })
    .resolves({ Body: await makeTarball() });

  const event: SQSEvent = {
    Records: [
      {
        attributes: {} as any,
        awsRegion: 'test-bermuda-1',
        body: JSON.stringify({
          tarballUri,
          integrity: computeIntegrity(
            { metadata: {}, tarballUri, time },
            await makeTarball().then((t) => t.transformToByteArray())
          ).integrity,
          time,
        }),
        eventSource: 'sqs',
        eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
        md5OfBody: 'Fake-MD5-Of-Body',
        messageAttributes: {},
        messageId: 'Fake-Message-ID',
        receiptHandle: 'Fake-Receipt-Handke',
      },
    ],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //
  await expect(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../backend/ingestion/ingestion.lambda').handler(
      event,
      context
    )
  ).resolves.toEqual([]);

  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.MISMATCHED_IDENTITY_REJECTIONS,
    1,
    'Count'
  );
});

test('mismatched package license', async () => {
  const s3Mock = mockClient(S3Client);
  const mockBucketName = 'fake-bucket';
  const mockStateMachineArn = 'fake-state-machine-arn';
  const mockConfigBucket = 'fake-config-bucket';
  const mockConfigkey = 'fake-config-obj-key';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
    .requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    if (name === 'STATE_MACHINE_ARN') {
      return mockStateMachineArn;
    }
    if (name === 'CONFIG_BUCKET_NAME') {
      return mockConfigBucket;
    }
    if (name === 'CONFIG_FILE_KEY') {
      return mockConfigkey;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeLicense = 'inscrutable-legalese';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(
    fakeAssembly(packageName, packageVersion, packageLicense + '-oops')
  );
  const mockConfig = JSON.stringify({
    packageLinks: [],
    packageTags: [],
  });

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  const makeTarball = async () =>
    buildTarGz({
      [`package/${SPEC_FILE_NAME}`]: fakeDotJsii,
      'package/LICENSE.md': fakeLicense,
      'package/index.js': '// Ignore me!',
      'package/package.json': JSON.stringify({
        name: packageName,
        version: packageVersion,
        license: packageLicense,
      }),
    });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockConfigBucket,
      Key: mockConfigkey,
    })
    .resolves({ Body: stringToStream(mockConfig) });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: stagingBucket,
      Key: stagingKey,
      VersionId: stagingVersion,
    })
    .resolves({ Body: await makeTarball() });

  const event: SQSEvent = {
    Records: [
      {
        attributes: {} as any,
        awsRegion: 'test-bermuda-1',
        body: JSON.stringify({
          tarballUri,
          integrity: computeIntegrity(
            { metadata: {}, tarballUri, time },
            await makeTarball().then((t) => t.transformToByteArray())
          ).integrity,
          time,
        }),
        eventSource: 'sqs',
        eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
        md5OfBody: 'Fake-MD5-Of-Body',
        messageAttributes: {},
        messageId: 'Fake-Message-ID',
        receiptHandle: 'Fake-Receipt-Handke',
      },
    ],
  };

  // We require the handler here so that any mocks to metricScope are set up
  // prior to the handler being created.
  //
  await expect(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../backend/ingestion/ingestion.lambda').handler(
      event,
      context
    )
  ).resolves.toEqual([]);

  expect(mockPutMetric).toHaveBeenCalledWith(
    MetricName.MISMATCHED_IDENTITY_REJECTIONS,
    1,
    'Count'
  );
});

test('missing .jsii file', async () => {
  const s3Mock = mockClient(S3Client);
  const mockBucketName = 'fake-bucket';
  const mockStateMachineArn = 'fake-state-machine-arn';
  const mockConfigBucket = 'fake-config-bucket';
  const mockConfigkey = 'fake-config-obj-key';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
    .requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    if (name === 'STATE_MACHINE_ARN') {
      return mockStateMachineArn;
    }
    if (name === 'CONFIG_BUCKET_NAME') {
      return mockConfigBucket;
    }
    if (name === 'CONFIG_FILE_KEY') {
      return mockConfigkey;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeLicense = 'inscrutable-legalese';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const mockConfig = JSON.stringify({
    packageLinks: [],
    packageTags: [],
  });

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  const makeTarball = async () =>
    buildTarGz({
      'package/LICENSE.md': fakeLicense,
      'package/index.js': '// Ignore me!',
      'package/package.json': JSON.stringify({
        name: packageName,
        version: packageVersion,
        license: packageLicense,
      }),
    });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockConfigBucket,
      Key: mockConfigkey,
    })
    .resolves({ Body: stringToStream(mockConfig) });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: stagingBucket,
      Key: stagingKey,
      VersionId: stagingVersion,
    })
    .resolves({ Body: await makeTarball() });

  const event: SQSEvent = {
    Records: [
      {
        attributes: {} as any,
        awsRegion: 'test-bermuda-1',
        body: JSON.stringify({
          tarballUri,
          integrity: computeIntegrity(
            { metadata: {}, tarballUri, time },
            await makeTarball().then((t) => t.transformToByteArray())
          ).integrity,
          time,
        }),
        eventSource: 'sqs',
        eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
        md5OfBody: 'Fake-MD5-Of-Body',
        messageAttributes: {},
        messageId: 'Fake-Message-ID',
        receiptHandle: 'Fake-Receipt-Handke',
      },
    ],
  };

  await expect(
    // We require the handler here so that any mocks to metricScope are set up
    // prior to the handler being created.
    //
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../backend/ingestion/ingestion.lambda').handler(
      event,
      context
    )
  ).resolves.toBeUndefined();
});

test('missing package.json file', async () => {
  const s3Mock = mockClient(S3Client);
  const mockBucketName = 'fake-bucket';
  const mockStateMachineArn = 'fake-state-machine-arn';
  const mockConfigBucket = 'fake-config-bucket';
  const mockConfigkey = 'fake-config-obj-key';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
    .requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    if (name === 'STATE_MACHINE_ARN') {
      return mockStateMachineArn;
    }
    if (name === 'CONFIG_BUCKET_NAME') {
      return mockConfigBucket;
    }
    if (name === 'CONFIG_FILE_KEY') {
      return mockConfigkey;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeLicense = 'inscrutable-legalese';
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const packageName = '@package-scope/package-name';
  const packageVersion = '1.2.3-pre.4';
  const packageLicense = 'Apache-2.0';
  const fakeDotJsii = JSON.stringify(
    fakeAssembly(packageName, packageVersion, packageLicense)
  );
  const mockConfig = JSON.stringify({
    packageLinks: [],
    packageTags: [],
  });

  const context: Context = {
    awsRequestId: 'Fake-Request-ID',
    logGroupName: 'Fake-Log-Group',
    logStreamName: 'Fake-Log-Stream',
  } as any;

  const makeTarball = async () =>
    buildTarGz({
      [`package/${SPEC_FILE_NAME}`]: fakeDotJsii,
      'package/LICENSE.md': fakeLicense,
      'package/index.js': '// Ignore me!',
    });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockConfigBucket,
      Key: mockConfigkey,
    })
    .resolves({ Body: stringToStream(mockConfig) });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: stagingBucket,
      Key: stagingKey,
      VersionId: stagingVersion,
    })
    .resolves({ Body: await makeTarball() });

  const event: SQSEvent = {
    Records: [
      {
        attributes: {} as any,
        awsRegion: 'test-bermuda-1',
        body: JSON.stringify({
          tarballUri,
          integrity: computeIntegrity(
            { metadata: {}, tarballUri, time },
            await makeTarball().then((t) => t.transformToByteArray())
          ).integrity,
          time,
        }),
        eventSource: 'sqs',
        eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
        md5OfBody: 'Fake-MD5-Of-Body',
        messageAttributes: {},
        messageId: 'Fake-Message-ID',
        receiptHandle: 'Fake-Receipt-Handke',
      },
    ],
  };

  await expect(
    // We require the handler here so that any mocks to metricScope are set up
    // prior to the handler being created.
    //
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../backend/ingestion/ingestion.lambda').handler(
      event,
      context
    )
  ).resolves.toBeUndefined();
});

/**
 * Builds a .tar.gz blob from the provided entries.
 */
async function buildTarGz(
  entries: Record<string, string | Buffer>
): Promise<StreamingBlobPayloadOutputTypes> {
  const tar = pack();
  const gzip = createGzip();
  tar.pipe(gzip, { end: true });

  for (const [name, data] of Object.entries(entries)) {
    await new Promise<void>((tok, tko) => {
      const bytes = typeof data === 'string' ? Buffer.from(data) : data;
      const entry = tar.entry(
        { name, size: bytes.length, mtime: new Date(0) },
        () => tok()
      );
      entry.once('error', tko);
      entry.end(bytes);
    });
  }
  tar.finalize();

  return Promise.resolve(
    sdkStreamMixin(gzip) as StreamingBlobPayloadOutputTypes
  );
}

function assertAssembly(expected: string, actual: string | undefined) {
  const expectedAssembly: Assembly = JSON.parse(expected);
  const actualAssembly: Assembly = JSON.parse(actual ?? '{}');

  // sanity: we have 2 types in the fake assembly
  expect(expectedAssembly.types).toBeDefined();
  expect(expectedAssembly.readme).toBeDefined();
  expect(expectedAssembly.dependencyClosure).toBeDefined();

  // handler deletes these fields from the assembly to reduce size
  delete expectedAssembly.types;
  delete expectedAssembly.readme;
  delete expectedAssembly.dependencyClosure;

  expect(actualAssembly).toStrictEqual(expectedAssembly);
}

interface FakeDependencyConfiguration extends DependencyConfiguration {
  readme?: any;
}

interface FakeAssembly extends Assembly {
  dependencyClosure: {
    [assembly: string]: FakeDependencyConfiguration;
  };
}

function fakeAssembly(
  name: string,
  version: string,
  license: string
): FakeAssembly {
  return {
    schema: SchemaVersion.LATEST,
    name,
    version,
    license,
    homepage: 'https://localhost.fake/repository',
    repository: { url: 'ssh://localhost.fake/repository.git', type: 'git' },
    author: {
      name: 'ACME',
      email: 'test@acme',
      organization: true,
      roles: ['author'],
    },
    description: 'This is a fake package assembly',
    readme: { markdown: 'Foo Bar ReadMe' },
    dependencyClosure: {
      'foo-boo': {
        readme: { markdown: 'hey' },
      },
    },
    jsiiVersion: '0.0.0+head',
    fingerprint: 'NOPE',
    types: {
      'datadog-cdk-constructs.Datadog': {
        assembly: 'datadog-cdk-constructs',
        base: '@aws-cdk/core.Construct',
        docs: {
          stability: Stability.Stable,
        },
        fqn: 'datadog-cdk-constructs.Datadog',
        initializer: {
          docs: {
            stability: Stability.Stable,
          },
          locationInModule: {
            filename: 'src/datadog.ts',
            line: 50,
          },
          parameters: [
            {
              name: 'scope',
              type: {
                fqn: '@aws-cdk/core.Construct',
              },
            },
            {
              name: 'id',
              type: {
                primitive: PrimitiveType.String,
              },
            },
            {
              name: 'props',
              type: {
                fqn: 'datadog-cdk-constructs.DatadogProps',
              },
            },
          ],
        },
        kind: TypeKind.Class,
        locationInModule: {
          filename: 'src/datadog.ts',
          line: 46,
        },
        methods: [
          {
            docs: {
              stability: Stability.Stable,
            },
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 125,
            },
            name: 'addForwarderToNonLambdaLogGroups',
            parameters: [
              {
                name: 'logGroups',
                type: {
                  collection: {
                    elementtype: {
                      fqn: '@aws-cdk/aws-logs.ILogGroup',
                    },
                    kind: CollectionKind.Array,
                  },
                },
              },
            ],
          },
          {
            docs: {
              stability: Stability.Stable,
            },
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 65,
            },
            name: 'addLambdaFunctions',
            parameters: [
              {
                name: 'lambdaFunctions',
                type: {
                  collection: {
                    elementtype: {
                      union: {
                        types: [
                          {
                            fqn: '@aws-cdk/aws-lambda.Function',
                          },
                          {
                            fqn: '@aws-cdk/aws-lambda-nodejs.NodejsFunction',
                          },
                          {
                            fqn: '@aws-cdk/aws-lambda-python.PythonFunction',
                          },
                        ],
                      },
                    },
                    kind: CollectionKind.Array,
                  },
                },
              },
            ],
          },
        ],
        name: 'Datadog',
        properties: [
          {
            docs: {
              stability: Stability.Stable,
            },
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 48,
            },
            name: 'props',
            type: {
              fqn: 'datadog-cdk-constructs.DatadogProps',
            },
          },
          {
            docs: {
              stability: Stability.Stable,
            },
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 47,
            },
            name: 'scope',
            type: {
              fqn: '@aws-cdk/core.Construct',
            },
          },
          {
            docs: {
              stability: Stability.Stable,
            },
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 49,
            },
            name: 'transport',
            type: {
              fqn: 'datadog-cdk-constructs.Transport',
            },
          },
        ],
      },
      'datadog-cdk-constructs.DatadogProps': {
        assembly: 'datadog-cdk-constructs',
        datatype: true,
        docs: {
          stability: Stability.Stable,
        },
        fqn: 'datadog-cdk-constructs.DatadogProps',
        kind: TypeKind.Interface,
        locationInModule: {
          filename: 'src/datadog.ts',
          line: 19,
        },
        name: 'DatadogProps',
        properties: [
          {
            abstract: true,
            docs: {
              stability: Stability.Stable,
            },
            immutable: true,
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 23,
            },
            name: 'addLayers',
            optional: true,
            type: {
              primitive: PrimitiveType.Boolean,
            },
          },
          {
            abstract: true,
            docs: {
              stability: Stability.Stable,
            },
            immutable: true,
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 27,
            },
            name: 'apiKey',
            optional: true,
            type: {
              primitive: PrimitiveType.String,
            },
          },
          {
            abstract: true,
            docs: {
              stability: Stability.Stable,
            },
            immutable: true,
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 28,
            },
            name: 'apiKmsKey',
            optional: true,
            type: {
              primitive: PrimitiveType.String,
            },
          },
          {
            abstract: true,
            docs: {
              stability: Stability.Stable,
            },
            immutable: true,
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 32,
            },
            name: 'enableDatadogLogs',
            optional: true,
            type: {
              primitive: PrimitiveType.Boolean,
            },
          },
          {
            abstract: true,
            docs: {
              stability: Stability.Stable,
            },
            immutable: true,
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 29,
            },
            name: 'enableDatadogTracing',
            optional: true,
            type: {
              primitive: PrimitiveType.Boolean,
            },
          },
          {
            abstract: true,
            docs: {
              stability: Stability.Stable,
            },
            immutable: true,
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 22,
            },
            name: 'extensionLayerVersion',
            optional: true,
            type: {
              primitive: PrimitiveType.Number,
            },
          },
          {
            abstract: true,
            docs: {
              stability: Stability.Stable,
            },
            immutable: true,
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 25,
            },
            name: 'flushMetricsToLogs',
            optional: true,
            type: {
              primitive: PrimitiveType.Boolean,
            },
          },
          {
            abstract: true,
            docs: {
              stability: Stability.Stable,
            },
            immutable: true,
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 24,
            },
            name: 'forwarderArn',
            optional: true,
            type: {
              primitive: PrimitiveType.String,
            },
          },
          {
            abstract: true,
            docs: {
              stability: Stability.Stable,
            },
            immutable: true,
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 30,
            },
            name: 'injectLogContext',
            optional: true,
            type: {
              primitive: PrimitiveType.Boolean,
            },
          },
          {
            abstract: true,
            docs: {
              stability: Stability.Stable,
            },
            immutable: true,
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 31,
            },
            name: 'logLevel',
            optional: true,
            type: {
              primitive: PrimitiveType.String,
            },
          },
          {
            abstract: true,
            docs: {
              stability: Stability.Stable,
            },
            immutable: true,
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 21,
            },
            name: 'nodeLayerVersion',
            optional: true,
            type: {
              primitive: PrimitiveType.Number,
            },
          },
          {
            abstract: true,
            docs: {
              stability: Stability.Stable,
            },
            immutable: true,
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 20,
            },
            name: 'pythonLayerVersion',
            optional: true,
            type: {
              primitive: PrimitiveType.Number,
            },
          },
          {
            abstract: true,
            docs: {
              stability: Stability.Stable,
            },
            immutable: true,
            locationInModule: {
              filename: 'src/datadog.ts',
              line: 26,
            },
            name: 'site',
            optional: true,
            type: {
              primitive: PrimitiveType.String,
            },
          },
        ],
      },
    },
  };
}
