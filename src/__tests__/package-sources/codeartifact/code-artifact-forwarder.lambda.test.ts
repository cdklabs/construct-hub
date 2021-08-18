import { pseudoRandomBytes } from 'crypto';
import type { Context } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import * as denyListClient from '../../../backend/deny-list/client.lambda-shared';
import { reset } from '../../../backend/shared/aws.lambda-shared';
import * as env from '../../../backend/shared/env.lambda-shared';
import { integrity } from '../../../backend/shared/integrity.lambda-shared';
import * as tarball from '../../../backend/shared/tarball.lambda-shared';
import { handler } from '../../../package-sources/codeartifact/code-artifact-forwarder.lambda';
import { safeMock } from '../../safe-mock';

const mockBucketName = 'mock-bucket-name';
const mockQueueUrl = 'https://mock-queue-url/dummy';
jest.mock('../../../backend/shared/env.lambda-shared');
(env.requireEnv as jest.MockedFunction<typeof env.requireEnv>)
  .mockName('mockEnv.requireEnv')
  .mockImplementation((name) => {
    switch (name) {
      case 'BUCKET_NAME':
        return mockBucketName;
      case 'QUEUE_URL':
        return mockQueueUrl;
      default:
        fail(`Attempted to use unexpected environment variable: ${name}`);
    }
  });

const mockDenyListClientLookup: jest.MockedFunction<denyListClient.DenyListClient['lookup']> = jest.fn()
  .mockName('mockDenyListClient.lookup');
jest.mock('../../../backend/deny-list/client.lambda-shared');
(denyListClient.DenyListClient.newClient as jest.MockedFunction<typeof denyListClient.DenyListClient.newClient>)
  .mockName('DenyListClient.newClient')
  .mockImplementation(() => Promise.resolve(safeMock<denyListClient.DenyListClient>('mockDenyListClient', {
    lookup: mockDenyListClientLookup,
  })));

jest.mock('../../../backend/shared/tarball.lambda-shared');
const mockExtractObjects = (tarball.extractObjects as jest.MockedFunction<typeof tarball.extractObjects>)
  .mockName('tarball.extractObjects');

beforeEach(() => {
  AWSMock.setSDKInstance(AWS);
});

afterEach(() => {
  AWSMock.restore();
  reset();
});

type RequestType = Parameters<typeof handler>[0];
const detail = safeMock<RequestType['detail']>('request.detail', {
  domainOwner: '123456789012',
  domainName: 'mock-domain-name',
  repositoryName: 'mock-repository-name',
  operationType: 'Created',
  packageName: 'pkg-name',
  packageNamespace: 'pkg-namespace',
  packageVersion: '1.2.3-dev.1337',
  packageFormat: 'npm',
  packageVersionRevision: pseudoRandomBytes(10).toString('base64'),
  eventDeduplicationId: pseudoRandomBytes(10).toString('base64'),
});

test('happy path', async () => {
  // GIVEN
  const mockContext = safeMock<Context>('mockContext', {
    awsRequestId: pseudoRandomBytes(6).toString('base64'),
    logGroupName: `mock-log-group-name-${pseudoRandomBytes(6).toString('base64')}`,
    logStreamName: `mock-log-stream-name-${pseudoRandomBytes(6).toString('base64')}`,
  });

  const mockGetPackageVersionAssetResult: AWS.CodeArtifact.GetPackageVersionAssetResult = {
    asset: 'mock-asset-content',
    assetName: 'package.tgz',
    packageVersion: '1.2.3-dev.1337',
    packageVersionRevision: pseudoRandomBytes(10).toString('base64'),
  };
  AWSMock.mock('CodeArtifact', 'getPackageVersionAsset', (request: AWS.CodeArtifact.GetPackageVersionAssetRequest, cb: Response<AWS.CodeArtifact.GetPackageVersionAssetResult>) => {
    try {
      expect(request).toEqual({
        asset: 'package.tgz',
        format: 'npm',
        domainOwner: detail.domainOwner,
        domain: detail.domainName,
        repository: detail.repositoryName,
        namespace: detail.packageNamespace,
        package: detail.packageName,
        packageVersion: detail.packageVersion,
      });
      cb(null, mockGetPackageVersionAssetResult);
    } catch (e) {
      cb(e);
    }
  });

  const mockAssembly = Buffer.from('mock-assembly-content');
  const mockPackageJson = safeMock<any>('package.json', { license: 'Apache-2.0' });
  mockExtractObjects.mockImplementationOnce(async (tgz, selector) => {
    expect(tgz).toEqual(Buffer.from(mockGetPackageVersionAssetResult.asset!));
    expect(selector).toHaveProperty('assemblyJson', { path: 'package/.jsii' });
    expect(selector).toHaveProperty('packageJson', { path: 'package/package.json', required: true });

    return {
      assemblyJson: mockAssembly,
      packageJson: Buffer.from(JSON.stringify(mockPackageJson)),
    };
  });

  const stagingKey = `@${detail.packageNamespace}/${detail.packageName}/${detail.packageVersion}/${mockGetPackageVersionAssetResult.packageVersionRevision}/package.tgz`;
  AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
    try {
      expect(req).toEqual({
        Bucket: mockBucketName,
        Key: stagingKey,
        Body: mockGetPackageVersionAssetResult.asset!,
        ContentType: 'application/octet-stream',
        Metadata: {
          'Lambda-Log-Group': mockContext.logGroupName,
          'Lambda-Log-Stream': mockContext.logStreamName,
          'Lambda-Run-Id': mockContext.awsRequestId,
        },
      });
      cb(null, safeMock<AWS.S3.PutObjectOutput>('mockS3PutObjectOutput', {}));
    } catch (e) {
      cb(e);
    }
  });

  const mockSendMessageResult: AWS.SQS.SendMessageResult = {
    MessageId: pseudoRandomBytes(10).toString('base64'),
  };
  const time = new Date().toISOString();
  const resources = ['arn:obviously:made:up'];
  AWSMock.mock('SQS', 'sendMessage', (req: AWS.SQS.SendMessageRequest, cb: Response<AWS.SQS.SendMessageResult>) => {
    try {
      expect(req).toEqual({
        MessageAttributes: {
          AWS_REQUEST_ID: { DataType: 'String', StringValue: mockContext.awsRequestId },
          LOG_GROUP_NAME: { DataType: 'String', StringValue: mockContext.logGroupName },
          LOG_STREAM_NAME: { DataType: 'String', StringValue: mockContext.logStreamName },
        },
        MessageBody: JSON.stringify({
          tarballUri: `s3://${mockBucketName}/${stagingKey}`,
          metadata: { resources: resources.join(', ') },
          time,
          integrity: integrity({
            tarballUri: `s3://${mockBucketName}/${stagingKey}`,
            metadata: { resources: resources.join(', ') },
            time,
          }, Buffer.from(mockGetPackageVersionAssetResult.asset!)),
        }),
        MessageDeduplicationId: detail.eventDeduplicationId,
        QueueUrl: mockQueueUrl,
      });
      cb(null, mockSendMessageResult);
    } catch (e) {
      cb(e);
    }
  });

  // WHEN
  const request: RequestType = safeMock<RequestType>('request', { resources, time, detail });

  // THEN
  await expect(handler(request, mockContext)).resolves.toEqual(mockSendMessageResult);
  expect(mockDenyListClientLookup).toHaveBeenCalledWith('@pkg-namespace/pkg-name', '1.2.3-dev.1337');
});

test('no license (i.e: UNLICENSED)', async () => {
  // GIVEN
  const mockContext = safeMock<Context>('mockContext', {
    awsRequestId: pseudoRandomBytes(6).toString('base64'),
    logGroupName: `mock-log-group-name-${pseudoRandomBytes(6).toString('base64')}`,
    logStreamName: `mock-log-stream-name-${pseudoRandomBytes(6).toString('base64')}`,
  });

  const mockGetPackageVersionAssetResult: AWS.CodeArtifact.GetPackageVersionAssetResult = {
    asset: 'mock-asset-content',
    assetName: 'package.tgz',
    packageVersion: '1.2.3-dev.1337',
    packageVersionRevision: pseudoRandomBytes(10).toString('base64'),
  };
  AWSMock.mock('CodeArtifact', 'getPackageVersionAsset', (request: AWS.CodeArtifact.GetPackageVersionAssetRequest, cb: Response<AWS.CodeArtifact.GetPackageVersionAssetResult>) => {
    try {
      expect(request).toEqual({
        asset: 'package.tgz',
        format: 'npm',
        domainOwner: detail.domainOwner,
        domain: detail.domainName,
        repository: detail.repositoryName,
        namespace: detail.packageNamespace,
        package: detail.packageName,
        packageVersion: detail.packageVersion,
      });
      cb(null, mockGetPackageVersionAssetResult);
    } catch (e) {
      cb(e);
    }
  });

  const mockAssembly = Buffer.from('mock-assembly-content');
  const mockPackageJson = safeMock<any>('package.json', { license: undefined });
  mockExtractObjects.mockImplementationOnce(async (tgz, selector) => {
    expect(tgz).toEqual(Buffer.from(mockGetPackageVersionAssetResult.asset!));
    expect(selector).toHaveProperty('assemblyJson', { path: 'package/.jsii' });
    expect(selector).toHaveProperty('packageJson', { path: 'package/package.json', required: true });

    return {
      assemblyJson: mockAssembly,
      packageJson: Buffer.from(JSON.stringify(mockPackageJson)),
    };
  });

  // WHEN
  const request: RequestType = safeMock<RequestType>('request', { time: new Date().toISOString(), detail });

  // THEN
  return expect(handler(request, mockContext)).resolves.toBeUndefined();
});

test('ineligible license', async () => {
  // GIVEN
  const mockContext = safeMock<Context>('mockContext', {
    awsRequestId: pseudoRandomBytes(6).toString('base64'),
    logGroupName: `mock-log-group-name-${pseudoRandomBytes(6).toString('base64')}`,
    logStreamName: `mock-log-stream-name-${pseudoRandomBytes(6).toString('base64')}`,
  });

  const mockGetPackageVersionAssetResult: AWS.CodeArtifact.GetPackageVersionAssetResult = {
    asset: 'mock-asset-content',
    assetName: 'package.tgz',
    packageVersion: '1.2.3-dev.1337',
    packageVersionRevision: pseudoRandomBytes(10).toString('base64'),
  };
  AWSMock.mock('CodeArtifact', 'getPackageVersionAsset', (request: AWS.CodeArtifact.GetPackageVersionAssetRequest, cb: Response<AWS.CodeArtifact.GetPackageVersionAssetResult>) => {
    try {
      expect(request).toEqual({
        asset: 'package.tgz',
        format: 'npm',
        domainOwner: detail.domainOwner,
        domain: detail.domainName,
        repository: detail.repositoryName,
        namespace: detail.packageNamespace,
        package: detail.packageName,
        packageVersion: detail.packageVersion,
      });
      cb(null, mockGetPackageVersionAssetResult);
    } catch (e) {
      cb(e);
    }
  });

  const mockAssembly = Buffer.from('mock-assembly-content');
  const mockPackageJson = safeMock<any>('package.json', { license: 'Phony-MOCK' });
  mockExtractObjects.mockImplementationOnce(async (tgz, selector) => {
    expect(tgz).toEqual(Buffer.from(mockGetPackageVersionAssetResult.asset!));
    expect(selector).toHaveProperty('assemblyJson', { path: 'package/.jsii' });
    expect(selector).toHaveProperty('packageJson', { path: 'package/package.json', required: true });

    return {
      assemblyJson: mockAssembly,
      packageJson: Buffer.from(JSON.stringify(mockPackageJson)),
    };
  });

  // WHEN
  const request: RequestType = safeMock<RequestType>('request', { time: new Date().toISOString(), detail });

  // THEN
  return expect(handler(request, mockContext)).resolves.toBeUndefined();
});

test('not a jsii package', async () => {
  // GIVEN
  const mockContext = safeMock<Context>('mockContext', {
    awsRequestId: pseudoRandomBytes(6).toString('base64'),
    logGroupName: `mock-log-group-name-${pseudoRandomBytes(6).toString('base64')}`,
    logStreamName: `mock-log-stream-name-${pseudoRandomBytes(6).toString('base64')}`,
  });

  const mockGetPackageVersionAssetResult: AWS.CodeArtifact.GetPackageVersionAssetResult = {
    asset: 'mock-asset-content',
    assetName: 'package.tgz',
    packageVersion: '1.2.3-dev.1337',
    packageVersionRevision: pseudoRandomBytes(10).toString('base64'),
  };
  AWSMock.mock('CodeArtifact', 'getPackageVersionAsset', (request: AWS.CodeArtifact.GetPackageVersionAssetRequest, cb: Response<AWS.CodeArtifact.GetPackageVersionAssetResult>) => {
    try {
      expect(request).toEqual({
        asset: 'package.tgz',
        format: 'npm',
        domainOwner: detail.domainOwner,
        domain: detail.domainName,
        repository: detail.repositoryName,
        namespace: detail.packageNamespace,
        package: detail.packageName,
        packageVersion: detail.packageVersion,
      });
      cb(null, mockGetPackageVersionAssetResult);
    } catch (e) {
      cb(e);
    }
  });

  const mockPackageJson = safeMock<any>('package.json', { license: 'Apache-2.0' });
  mockExtractObjects.mockImplementationOnce(async (tgz, selector) => {
    expect(tgz).toEqual(Buffer.from(mockGetPackageVersionAssetResult.asset!));
    expect(selector).toHaveProperty('assemblyJson', { path: 'package/.jsii' });
    expect(selector).toHaveProperty('packageJson', { path: 'package/package.json', required: true });

    return {
      assemblyJson: undefined,
      packageJson: Buffer.from(JSON.stringify(mockPackageJson)),
    };
  });

  // WHEN
  const request: RequestType = safeMock<RequestType>('request', { time: new Date().toISOString(), detail });

  // THEN
  return expect(handler(request, mockContext)).resolves.toBeUndefined();
});

test('deny-listed package', async () => {
  // GIVEN
  const mockContext = safeMock<Context>('mockContext', {});

  mockDenyListClientLookup.mockImplementationOnce((name, version) => {
    expect(name).toBe('@pkg-namespace/pkg-name');
    expect(version).toBe('1.2.3-dev.1337');
    return {
      packageName: '@pkg-namespace/pkg-name',
      reason: 'I decided so',
    };
  });

  // WHEN
  const request: RequestType = safeMock<RequestType>('request', { time: new Date().toISOString(), detail });

  // THEN
  return expect(handler(request, mockContext)).resolves.toBeUndefined();
});

test('deleted package', async () => {
  // GIVEN
  const mockContext = safeMock<Context>('mockContext', {});

  // WHEN
  const request: RequestType = safeMock<RequestType>('request', { time: new Date().toISOString(), detail: { ...detail, operationType: 'Deleted' } });

  // THEN
  return expect(handler(request, mockContext)).resolves.toBeUndefined();
});

type Response<T> = (err: AWS.AWSError | null, data?: T) => void;
