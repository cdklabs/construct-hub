import { pseudoRandomBytes } from 'crypto';
import {
  CodeartifactClient,
  GetPackageVersionAssetCommand,
  GetPackageVersionAssetCommandOutput,
} from '@aws-sdk/client-codeartifact';
import {
  PutObjectCommand,
  PutObjectCommandOutput,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  SendMessageCommand,
  SendMessageResult,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { SPEC_FILE_NAME } from '@jsii/spec';
import type { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import * as denyListClient from '../../../backend/deny-list/client.lambda-shared';
import * as licenseListClient from '../../../backend/license-list/client.lambda-shared';
import * as env from '../../../backend/shared/env.lambda-shared';
import { integrity } from '../../../backend/shared/integrity.lambda-shared';
import * as tarball from '../../../backend/shared/tarball.lambda-shared';
import { handler } from '../../../package-sources/codeartifact/code-artifact-forwarder.lambda';
import { safeMock } from '../../safe-mock';
import { stringToStream } from '../../streams';

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

const mockDenyListClientLookup: jest.MockedFunction<
  denyListClient.DenyListClient['lookup']
> = jest.fn().mockName('mockDenyListClient.lookup');
jest.mock('../../../backend/deny-list/client.lambda-shared');
(
  denyListClient.DenyListClient.newClient as jest.MockedFunction<
    typeof denyListClient.DenyListClient.newClient
  >
)
  .mockName('DenyListClient.newClient')
  .mockImplementation(() =>
    Promise.resolve(
      safeMock<denyListClient.DenyListClient>('mockDenyListClient', {
        lookup: mockDenyListClientLookup,
      })
    )
  );

const mockLicenseListLookup: jest.MockedFunction<
  licenseListClient.LicenseListClient['lookup']
> = jest.fn().mockName('mockLicenseListClient.lookup');
jest.mock('../../../backend/license-list/client.lambda-shared');
(
  licenseListClient.LicenseListClient.newClient as jest.MockedFunction<
    typeof licenseListClient.LicenseListClient.newClient
  >
)
  .mockName('LicenseListClient.newClient')
  .mockImplementation(() =>
    Promise.resolve(
      safeMock<licenseListClient.LicenseListClient>('mockLicenseListClient', {
        lookup: mockLicenseListLookup,
      })
    )
  );

jest.mock('../../../backend/shared/tarball.lambda-shared');
const mockExtractObjects = (
  tarball.extractObjects as jest.MockedFunction<typeof tarball.extractObjects>
).mockName('tarball.extractObjects');

const mockCodeartifact = mockClient(CodeartifactClient);
const mockS3 = mockClient(S3Client);
const mockSQS = mockClient(SQSClient);

beforeEach(() => {
  mockCodeartifact.reset();
  mockS3.reset();
  mockSQS.reset();
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
});

test('happy path', async () => {
  // GIVEN
  const mockContext = safeMock<Context>('mockContext', {
    awsRequestId: pseudoRandomBytes(6).toString('base64'),
    logGroupName: `mock-log-group-name-${pseudoRandomBytes(6).toString(
      'base64'
    )}`,
    logStreamName: `mock-log-stream-name-${pseudoRandomBytes(6).toString(
      'base64'
    )}`,
  });

  const mockAsset = 'mock-asset-content';
  const mockGetPackageVersionAssetResult: GetPackageVersionAssetResponse = {
    asset: stringToStream(mockAsset),
    assetName: 'package.tgz',
    packageVersion: '1.2.3-dev.1337',
    packageVersionRevision: pseudoRandomBytes(10).toString('base64'),
  };

  mockCodeartifact
    .on(GetPackageVersionAssetCommand, {
      asset: 'package.tgz',
      format: 'npm',
      domainOwner: detail.domainOwner,
      domain: detail.domainName,
      repository: detail.repositoryName,
      namespace: detail.packageNamespace,
      package: detail.packageName,
      packageVersion: detail.packageVersion,
    })
    .resolves(mockGetPackageVersionAssetResult);

  const mockAssembly = Buffer.from('mock-assembly-content');
  const mockPackageJson = safeMock<any>('package.json', {
    license: 'Apache-2.0',
  });
  mockExtractObjects.mockImplementationOnce(async (tgz, selector) => {
    expect(tgz).toEqual(Buffer.from(mockAsset));
    expect(selector).toHaveProperty('assemblyJson', {
      path: `package/${SPEC_FILE_NAME}`,
    });
    expect(selector).toHaveProperty('packageJson', {
      path: 'package/package.json',
      required: true,
    });

    return {
      assemblyJson: mockAssembly,
      packageJson: Buffer.from(JSON.stringify(mockPackageJson)),
    };
  });

  mockLicenseListLookup.mockReturnValueOnce('Apache-2.0');

  const stagingKey = `@${detail.packageNamespace}/${detail.packageName}/${detail.packageVersion}/${mockGetPackageVersionAssetResult.packageVersionRevision}/package.tgz`;

  mockS3.on(PutObjectCommand).callsFake((req) => {
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
    return safeMock<PutObjectCommandOutput>('mockS3PutObjectOutput', {});
  });

  const mockSendMessageResult: SendMessageResult = {
    MessageId: pseudoRandomBytes(10).toString('base64'),
  };
  const time = new Date().toISOString();
  const resources = ['arn:obviously:made:up'];
  mockSQS
    .on(SendMessageCommand, {
      MessageAttributes: {
        AWS_REQUEST_ID: {
          DataType: 'String',
          StringValue: mockContext.awsRequestId,
        },
        LOG_GROUP_NAME: {
          DataType: 'String',
          StringValue: mockContext.logGroupName,
        },
        LOG_STREAM_NAME: {
          DataType: 'String',
          StringValue: mockContext.logStreamName,
        },
      },
      MessageBody: JSON.stringify(
        integrity(
          {
            tarballUri: `s3://${mockBucketName}/${stagingKey}`,
            metadata: { resources: resources.join(', ') },
            time,
          },
          Buffer.from(mockAsset)
        )
      ),
      QueueUrl: mockQueueUrl,
    })
    .resolves(mockSendMessageResult);

  // WHEN
  const request: RequestType = safeMock<RequestType>('request', {
    resources,
    time,
    detail,
  });

  // THEN
  await expect(handler(request, mockContext)).resolves.toEqual(
    mockSendMessageResult
  );
  expect(mockDenyListClientLookup).toHaveBeenCalledWith(
    '@pkg-namespace/pkg-name',
    '1.2.3-dev.1337'
  );
  return expect(mockLicenseListLookup).toHaveBeenCalledWith('Apache-2.0');
});

test('no license (i.e: UNLICENSED)', async () => {
  // GIVEN
  const mockContext = safeMock<Context>('mockContext', {
    awsRequestId: pseudoRandomBytes(6).toString('base64'),
    logGroupName: `mock-log-group-name-${pseudoRandomBytes(6).toString(
      'base64'
    )}`,
    logStreamName: `mock-log-stream-name-${pseudoRandomBytes(6).toString(
      'base64'
    )}`,
  });

  const mockAsset = 'mock-asset-content';
  const mockGetPackageVersionAssetResult: GetPackageVersionAssetResponse = {
    asset: stringToStream(mockAsset),
    assetName: 'package.tgz',
    packageVersion: '1.2.3-dev.1337',
    packageVersionRevision: pseudoRandomBytes(10).toString('base64'),
  };

  mockCodeartifact
    .on(GetPackageVersionAssetCommand, {
      asset: 'package.tgz',
      format: 'npm',
      domainOwner: detail.domainOwner,
      domain: detail.domainName,
      repository: detail.repositoryName,
      namespace: detail.packageNamespace,
      package: detail.packageName,
      packageVersion: detail.packageVersion,
    })
    .resolves(mockGetPackageVersionAssetResult);

  const mockAssembly = Buffer.from('mock-assembly-content');
  const mockPackageJson = safeMock<any>('package.json', { license: undefined });
  mockExtractObjects.mockImplementationOnce(async (tgz, selector) => {
    expect(tgz).toEqual(Buffer.from(mockAsset));
    expect(selector).toHaveProperty('assemblyJson', {
      path: `package/${SPEC_FILE_NAME}`,
    });
    expect(selector).toHaveProperty('packageJson', {
      path: 'package/package.json',
      required: true,
    });

    return {
      assemblyJson: mockAssembly,
      packageJson: Buffer.from(JSON.stringify(mockPackageJson)),
    };
  });

  // WHEN
  const request: RequestType = safeMock<RequestType>('request', {
    time: new Date().toISOString(),
    detail,
  });

  // THEN
  await expect(handler(request, mockContext)).resolves.toBeUndefined();
  return expect(mockLicenseListLookup).toHaveBeenCalledWith('UNLICENSED');
});

test('ineligible license', async () => {
  // GIVEN
  const mockContext = safeMock<Context>('mockContext', {
    awsRequestId: pseudoRandomBytes(6).toString('base64'),
    logGroupName: `mock-log-group-name-${pseudoRandomBytes(6).toString(
      'base64'
    )}`,
    logStreamName: `mock-log-stream-name-${pseudoRandomBytes(6).toString(
      'base64'
    )}`,
  });

  const mockAsset = 'mock-asset-content';
  const mockGetPackageVersionAssetResult: GetPackageVersionAssetResponse = {
    asset: stringToStream(mockAsset),
    assetName: 'package.tgz',
    packageVersion: '1.2.3-dev.1337',
    packageVersionRevision: pseudoRandomBytes(10).toString('base64'),
  };
  mockCodeartifact
    .on(GetPackageVersionAssetCommand, {
      asset: 'package.tgz',
      format: 'npm',
      domainOwner: detail.domainOwner,
      domain: detail.domainName,
      repository: detail.repositoryName,
      namespace: detail.packageNamespace,
      package: detail.packageName,
      packageVersion: detail.packageVersion,
    })
    .resolves(mockGetPackageVersionAssetResult);

  const mockAssembly = Buffer.from('mock-assembly-content');
  const mockPackageJson = safeMock<any>('package.json', {
    license: 'Phony-MOCK',
  });
  mockExtractObjects.mockImplementationOnce(async (tgz, selector) => {
    expect(tgz).toEqual(Buffer.from(mockAsset));
    expect(selector).toHaveProperty('assemblyJson', {
      path: `package/${SPEC_FILE_NAME}`,
    });
    expect(selector).toHaveProperty('packageJson', {
      path: 'package/package.json',
      required: true,
    });

    return {
      assemblyJson: mockAssembly,
      packageJson: Buffer.from(JSON.stringify(mockPackageJson)),
    };
  });

  // WHEN
  const request: RequestType = safeMock<RequestType>('request', {
    time: new Date().toISOString(),
    detail,
  });

  // THEN
  await expect(handler(request, mockContext)).resolves.toBeUndefined();
  return expect(mockLicenseListLookup).toHaveBeenCalledWith('Phony-MOCK');
});

test('not a jsii package', async () => {
  // GIVEN
  const mockContext = safeMock<Context>('mockContext', {
    awsRequestId: pseudoRandomBytes(6).toString('base64'),
    logGroupName: `mock-log-group-name-${pseudoRandomBytes(6).toString(
      'base64'
    )}`,
    logStreamName: `mock-log-stream-name-${pseudoRandomBytes(6).toString(
      'base64'
    )}`,
  });

  const mockAsset = 'mock-asset-content';
  const mockGetPackageVersionAssetResult: GetPackageVersionAssetResponse = {
    asset: stringToStream(mockAsset),
    assetName: 'package.tgz',
    packageVersion: '1.2.3-dev.1337',
    packageVersionRevision: pseudoRandomBytes(10).toString('base64'),
  };
  mockCodeartifact
    .on(GetPackageVersionAssetCommand, {
      asset: 'package.tgz',
      format: 'npm',
      domainOwner: detail.domainOwner,
      domain: detail.domainName,
      repository: detail.repositoryName,
      namespace: detail.packageNamespace,
      package: detail.packageName,
      packageVersion: detail.packageVersion,
    })
    .resolves(mockGetPackageVersionAssetResult);

  const mockPackageJson = safeMock<any>('package.json', {
    license: 'Apache-2.0',
  });
  mockExtractObjects.mockImplementationOnce(async (tgz, selector) => {
    expect(tgz).toEqual(Buffer.from(mockAsset));
    expect(selector).toHaveProperty('assemblyJson', {
      path: `package/${SPEC_FILE_NAME}`,
    });
    expect(selector).toHaveProperty('packageJson', {
      path: 'package/package.json',
      required: true,
    });

    return {
      assemblyJson: undefined,
      packageJson: Buffer.from(JSON.stringify(mockPackageJson)),
    };
  });

  // WHEN
  const request: RequestType = safeMock<RequestType>('request', {
    time: new Date().toISOString(),
    detail,
  });

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
  const request: RequestType = safeMock<RequestType>('request', {
    time: new Date().toISOString(),
    detail,
  });

  // THEN
  return expect(handler(request, mockContext)).resolves.toBeUndefined();
});

test('deleted package', async () => {
  // GIVEN
  const mockContext = safeMock<Context>('mockContext', {});

  // WHEN
  const request: RequestType = safeMock<RequestType>('request', {
    time: new Date().toISOString(),
    detail: { ...detail, operationType: 'Deleted' },
  });

  // THEN
  return expect(handler(request, mockContext)).resolves.toBeUndefined();
});

type GetPackageVersionAssetResponse = Omit<
  GetPackageVersionAssetCommandOutput,
  '$metadata'
>;
