import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import * as constants from '../../../backend/release-notes/constants';
import { generateReleaseNotes } from '../../../backend/release-notes/shared/github-changelog-fetcher.lambda-shared';
import { extractObjects } from '../../../backend/shared/tarball.lambda-shared';
import { stringToStream } from '../../streams';

jest.mock('aws-embedded-metrics');
jest.mock('../../../backend/shared/tarball.lambda-shared');
jest.mock(
  '../../../backend/release-notes/shared/github-changelog-fetcher.lambda-shared'
);

const MOCK_BUCKET_NAME = 'package-data-bucket';
const PACKAGE_TGZ = 'data/@aws-cdk/aws-amplify/v1.144.0/package.tgz';
const FAKE_TAR_DATA = 'fake-tarball-content[gzipped]';
const FAKE_TAR_GZ = Buffer.from(FAKE_TAR_DATA);
const MOCK_TARBALL_URI = `s3://${MOCK_BUCKET_NAME}.test-bermuda-2.s3.amazonaws.com/${PACKAGE_TGZ}`;
const MOCK_RELEASE_NOTES_KEY =
  'data/@aws-cdk/aws-amplify/v1.144.0/release-notes.md';

const MOCK_PKG_REPO_OWNER = 'aws';
const MOCK_PKG_PROJECT_NAME = 'aws-cdk';
const MOCK_PKG_DIRECTORY = 'packages/@aws-cdk/aws-amplify';
const MOCK_PKG_NAME = 'aws-cdk-lib/aws-amplify';
const MOCK_PKG_VERSION = '1.144.0';

const MOCKED_PACKAGE_JSON = {
  name: MOCK_PKG_NAME,
  version: MOCK_PKG_VERSION,
  repository: {
    type: 'git',
    url: `https://github.com/${MOCK_PKG_REPO_OWNER}/${MOCK_PKG_PROJECT_NAME}.git`,
    directory: MOCK_PKG_DIRECTORY,
  },
};

const MOCKED_RELEASE_NOTES = `
## Mock Features
* something new and exciting
* something not that exciting

## BugFix
* Some bug
* Some other bug
`;

const mockS3 = mockClient(S3Client);

const mockPutMetric = jest
  .fn()
  .mockName('MetricsLogger.putMetric') as jest.MockedFunction<
  MetricsLogger['putMetric']
>;

const mockSetNamespace = jest
  .fn()
  .mockName('MetricsLogger.mockSetNamespace') as jest.MockedFunction<
  MetricsLogger['setNamespace']
>;

let handler: any;
const extractObjectMock = <jest.MockedFunction<typeof extractObjects>>(
  extractObjects
);
const generateReleaseNotesMock = <
  jest.MockedFunction<typeof generateReleaseNotes>
>generateReleaseNotes;

beforeAll(() => {
  // Setup the metric scope
  const mockMetricScope = metricScope as jest.MockedFunction<
    typeof metricScope
  >;
  const mockMetrics: MetricsLogger = {
    putMetric: mockPutMetric,
    setNamespace: mockSetNamespace.mockImplementation((namespace) => {
      expect(namespace).toEqual(constants.METRICS_NAMESPACE);
      return mockMetrics;
    }),
    setDimensions: (...args: any[]) => expect(args).toEqual([{}]),
  } as any;

  mockMetricScope.mockImplementation((cb) => {
    const impl = cb(mockMetrics);
    return async (...args) => impl(...args);
  });

  // Importing on top will not work as the metricScope will not be mocked by the time import happens
  ({
    handler,
  } = require('../../../backend/release-notes/generate-release-notes.lambda')); // eslint-disable-line @typescript-eslint/no-require-imports
});

beforeEach(async () => {
  // Set Env var needed for the lambda
  jest.resetAllMocks();
  process.env.BUCKET_NAME = MOCK_BUCKET_NAME;

  mockS3.reset();
  setupPkgTarS3GetObjectMock();
  setupReleaseNotesS3PutObjectMock();

  extractObjectMock.mockResolvedValue({
    packageJson: Buffer.from(JSON.stringify(MOCKED_PACKAGE_JSON)),
  });
  generateReleaseNotesMock.mockResolvedValue(MOCKED_RELEASE_NOTES);
});

afterEach(async () => {
  // clean up the env vars
  process.env.BUCKET_NAME = undefined;
});

test('happy case', async () => {
  await expect(
    handler({ tarballUri: MOCK_TARBALL_URI }, {} as any)
  ).resolves.toEqual({ error: null, releaseNotes: MOCKED_RELEASE_NOTES });
  expect(extractObjectMock).toHaveBeenCalledTimes(1);
  expect(extractObjectMock).toHaveBeenCalledWith(FAKE_TAR_GZ, {
    packageJson: { path: 'package/package.json', required: true },
  });

  expect(mockS3).toHaveReceivedCommandTimes(GetObjectCommand, 1);
  expect(mockS3).toHaveReceivedCommandTimes(PutObjectCommand, 1);

  expect(generateReleaseNotes).toHaveBeenCalledTimes(1);
  expect(generateReleaseNotes).toHaveBeenCalledWith(
    MOCK_PKG_REPO_OWNER,
    MOCK_PKG_PROJECT_NAME,
    MOCK_PKG_NAME,
    MOCK_PKG_VERSION,
    MOCK_PKG_DIRECTORY
  );
});

test('When repository uses git@github.com url', async () => {
  const PKG_JSON_GITHUB_REPO_URL = {
    ...MOCKED_PACKAGE_JSON,
    repository: {
      url: `git@github.com:${MOCK_PKG_REPO_OWNER}/${MOCK_PKG_PROJECT_NAME}.git`,
      directory: MOCK_PKG_DIRECTORY,
    },
  };

  extractObjectMock.mockResolvedValueOnce({
    packageJson: Buffer.from(JSON.stringify(PKG_JSON_GITHUB_REPO_URL)),
  });

  await expect(
    handler({ tarballUri: MOCK_TARBALL_URI }, {} as any)
  ).resolves.toEqual({ error: null, releaseNotes: MOCKED_RELEASE_NOTES });

  expect(extractObjectMock).toHaveBeenCalledTimes(1);
  expect(extractObjectMock).toHaveBeenCalledWith(FAKE_TAR_GZ, {
    packageJson: { path: 'package/package.json', required: true },
  });

  expect(mockS3).toHaveReceivedCommandTimes(GetObjectCommand, 1);
  expect(mockS3).toHaveReceivedCommandTimes(PutObjectCommand, 1);

  expect(generateReleaseNotes).toHaveBeenCalledTimes(1);
  expect(generateReleaseNotes).toHaveBeenCalledWith(
    MOCK_PKG_REPO_OWNER,
    MOCK_PKG_PROJECT_NAME,
    MOCK_PKG_NAME,
    MOCK_PKG_VERSION,
    MOCK_PKG_DIRECTORY
  );
});

test('When repository info is missing sends "UnSupportedRepo"', async () => {
  const PKG_JSON_WITHOUT_REPO = {
    ...MOCKED_PACKAGE_JSON,
    repository: undefined,
  };
  extractObjectMock.mockResolvedValueOnce({
    packageJson: Buffer.from(JSON.stringify(PKG_JSON_WITHOUT_REPO)),
  });

  await expect(
    handler({ tarballUri: MOCK_TARBALL_URI }, {} as any)
  ).resolves.toEqual({ error: 'UnSupportedRepo' });
  expect(generateReleaseNotes).not.toHaveBeenCalled();

  expect(mockS3).toHaveReceivedCommandTimes(GetObjectCommand, 1);
  expect(mockS3).not.toHaveReceivedCommand(PutObjectCommand);

  const PKG_JSON_WITH_GITLAB_REPO = {
    ...MOCKED_PACKAGE_JSON,
    repository: { ...MOCKED_PACKAGE_JSON, url: 'https://gitlab.com' },
  };
  extractObjectMock.mockResolvedValueOnce({
    packageJson: Buffer.from(JSON.stringify(PKG_JSON_WITH_GITLAB_REPO)),
  });

  await expect(
    handler({ tarballUri: MOCK_TARBALL_URI }, {} as any)
  ).resolves.toEqual({ error: 'UnSupportedRepo' });
  expect(generateReleaseNotes).not.toHaveBeenCalled();
  expect(mockS3).toHaveReceivedCommandTimes(GetObjectCommand, 2);
  expect(mockS3).not.toHaveReceivedCommand(PutObjectCommand);
  expect(mockPutMetric).toHaveBeenCalledWith(
    constants.UnSupportedRepo,
    1,
    Unit.Count
  );
});

test('sends RequestQuotaExhausted error when GitHub sends error code 403', async () => {
  extractObjectMock.mockResolvedValue({
    packageJson: Buffer.from(JSON.stringify(MOCKED_PACKAGE_JSON)),
  });
  generateReleaseNotesMock.mockRejectedValue({
    status: 403,
  });

  await expect(
    handler({ tarballUri: MOCK_TARBALL_URI }, {} as any)
  ).resolves.toEqual({
    error: 'RequestQuotaExhausted',
    releaseNotes: undefined,
  });

  expect(extractObjectMock).toHaveBeenCalledTimes(1);
  expect(extractObjectMock).toHaveBeenCalledWith(FAKE_TAR_GZ, {
    packageJson: { path: 'package/package.json', required: true },
  });

  expect(mockS3).toHaveReceivedCommandTimes(GetObjectCommand, 1);
  expect(mockS3).not.toHaveReceivedCommand(PutObjectCommand);
  expect(mockPutMetric).toHaveBeenCalledWith(
    constants.RequestQuotaExhausted,
    1,
    Unit.Count
  );
});

test('sends InvalidCredentials error when GitHub sends error code 401', async () => {
  extractObjectMock.mockResolvedValue({
    packageJson: Buffer.from(JSON.stringify(MOCKED_PACKAGE_JSON)),
  });

  generateReleaseNotesMock.mockRejectedValue({
    status: 401,
  });

  await expect(
    handler({ tarballUri: MOCK_TARBALL_URI }, {} as any)
  ).resolves.toEqual({ error: 'InvalidCredentials', releaseNotes: undefined });

  expect(extractObjectMock).toHaveBeenCalledTimes(1);
  expect(extractObjectMock).toHaveBeenCalledWith(FAKE_TAR_GZ, {
    packageJson: { path: 'package/package.json', required: true },
  });

  expect(mockS3).toHaveReceivedCommandTimes(GetObjectCommand, 1);
  expect(mockS3).not.toHaveReceivedCommand(PutObjectCommand);
  expect(mockPutMetric).toHaveBeenCalledWith(
    constants.InvalidCredentials,
    1,
    Unit.Count
  );
});

test('When GH does not have any release notes', async () => {
  extractObjectMock.mockResolvedValue({
    packageJson: Buffer.from(JSON.stringify(MOCKED_PACKAGE_JSON)),
  });

  generateReleaseNotesMock.mockResolvedValueOnce(undefined);

  await expect(
    handler({ tarballUri: MOCK_TARBALL_URI }, {} as any)
  ).resolves.toEqual({ error: null, releaseNotes: undefined });

  expect(extractObjectMock).toHaveBeenCalledTimes(1);
  expect(extractObjectMock).toHaveBeenCalledWith(FAKE_TAR_GZ, {
    packageJson: { path: 'package/package.json', required: true },
  });

  expect(mockS3).toHaveReceivedCommandTimes(GetObjectCommand, 1);
  expect(mockS3).not.toHaveReceivedCommand(PutObjectCommand);
});

test('when tarball is invalid send InvalidTarball error', async () => {
  // Missing package.json
  extractObjectMock.mockRejectedValueOnce(
    new Error('Missing required entry in tarball: package.json')
  );
  await expect(
    handler({ tarballUri: MOCK_TARBALL_URI }, {} as any)
  ).resolves.toEqual({ error: 'InvalidTarball', releaseNotes: undefined });

  expect(extractObjectMock).toHaveBeenCalledTimes(1);
  expect(extractObjectMock).toHaveBeenCalledWith(FAKE_TAR_GZ, {
    packageJson: { path: 'package/package.json', required: true },
  });

  expect(mockS3).toHaveReceivedCommandTimes(GetObjectCommand, 1);
  expect(mockS3).not.toHaveReceivedCommand(PutObjectCommand);
  expect(mockPutMetric).toHaveBeenCalledWith(
    constants.InvalidTarball,
    1,
    Unit.Count
  );
});

test('throw error when the tarball uri is not a valid s3 url', async () => {
  await expect(
    handler({ tarballUri: 'http://something.com/my-package' }, {} as any)
  ).resolves.toEqual({ error: 'UnSupportedTarballUrl' });
  expect(mockPutMetric).toHaveBeenCalledWith(
    constants.UnSupportedTarballUrl,
    1,
    Unit.Count
  );
});

test('throw error when package.json is not valid', async () => {
  // Missing package.json
  extractObjectMock.mockResolvedValue({
    packageJson: Buffer.from('{InvalidJSON}'),
  });
  await expect(
    handler({ tarballUri: MOCK_TARBALL_URI }, {} as any)
  ).resolves.toEqual({ error: 'InvalidPackageJson' });

  expect(extractObjectMock).toHaveBeenCalledTimes(1);
  expect(extractObjectMock).toHaveBeenCalledWith(FAKE_TAR_GZ, {
    packageJson: { path: 'package/package.json', required: true },
  });

  expect(mockS3).toHaveReceivedCommandTimes(GetObjectCommand, 1);
  expect(mockS3).not.toHaveReceivedCommand(PutObjectCommand);
  expect(mockPutMetric).toHaveBeenCalledWith(
    constants.InvalidPackageJson,
    1,
    Unit.Count
  );
});

// Helper functions
const setupPkgTarS3GetObjectMock = () => {
  mockS3
    .on(GetObjectCommand, {
      Bucket: MOCK_BUCKET_NAME,
      Key: PACKAGE_TGZ,
    })
    .callsFake(() => ({ Body: stringToStream(FAKE_TAR_DATA) }));
};

function setupReleaseNotesS3PutObjectMock() {
  mockS3
    .on(PutObjectCommand, {
      Bucket: MOCK_BUCKET_NAME,
      Key: MOCK_RELEASE_NOTES_KEY,
      Body: MOCKED_RELEASE_NOTES,
      ContentType: 'text/markdown',
    })
    .resolves({});
}
