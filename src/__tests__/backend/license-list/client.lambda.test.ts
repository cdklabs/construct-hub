import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import * as Case from 'case';
import { LicenseListClient } from '../../../backend/license-list/client.lambda-shared';
import { EnvironmentVariables } from '../../../backend/license-list/constants';
import { requireEnv } from '../../../backend/shared/env.lambda-shared';
import { stringToStream } from '../../streams';

jest.mock('../../../backend/shared/env.lambda-shared');
const mockRequireEnv = requireEnv as jest.MockedFunction<typeof requireEnv>;
const mockBucketName = 'fake-bucket';
const mockObjectKey = 'object/key';

const mockS3 = mockClient(S3Client);

beforeEach(() => {
  mockS3.reset();
  mockRequireEnv.mockImplementation((name: string) => {
    switch (name) {
      case EnvironmentVariables.BUCKET_NAME:
        return mockBucketName;
      case EnvironmentVariables.OBJECT_KEY:
        return mockObjectKey;
      default:
        throw new Error(
          `Attempted to use unexpected environment variable: ${name}`
        );
    }
  });
});

test('basic use', async () => {
  // GIVEN
  const mockLicense = 'MockLicense-1.0';
  mockS3
    .on(GetObjectCommand, { Bucket: mockBucketName, Key: mockObjectKey })
    .resolves({ Body: stringToStream(JSON.stringify([mockLicense])) });

  // WHEN
  const licenseList = await LicenseListClient.newClient();

  // THEN
  expect(licenseList.lookup(Case.random(mockLicense))).toBe(mockLicense);
  expect(licenseList.lookup('NotInList')).toBeUndefined();
});

test('empty list', async () => {
  // GIVEN
  mockS3
    .on(GetObjectCommand, { Bucket: mockBucketName, Key: mockObjectKey })
    .resolves({ Body: stringToStream(JSON.stringify([])) });

  // WHEN
  const licenseList = await LicenseListClient.newClient();

  // THEN
  expect(licenseList.lookup('NotInList')).toBeUndefined();
});

test('absent list', async () => {
  // GIVEN
  mockS3
    .on(GetObjectCommand, { Bucket: mockBucketName, Key: mockObjectKey })
    .resolves({});

  // WHEN
  const licenseList = await LicenseListClient.newClient();

  // THEN
  expect(licenseList.lookup('NotInList')).toBeUndefined();
});

test('broken list', async () => {
  // GIVEN
  mockS3
    .on(GetObjectCommand, { Bucket: mockBucketName, Key: mockObjectKey })
    .resolves({ Body: stringToStream(JSON.stringify('{}', null, 2)) });

  // THEN
  return expect(LicenseListClient.newClient()).rejects.toThrowError(
    /Invalid format/
  );
});
