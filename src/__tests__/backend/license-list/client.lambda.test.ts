import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import * as Case from 'case';
import { LicenseListClient } from '../../../backend/license-list/client.lambda-shared';
import { EnvironmentVariables } from '../../../backend/license-list/constants';
import { reset } from '../../../backend/shared/aws.lambda-shared';
import { requireEnv } from '../../../backend/shared/env.lambda-shared';

jest.mock('../../../backend/shared/env.lambda-shared');
const mockRequireEnv = requireEnv as jest.MockedFunction<typeof requireEnv>;
const mockBucketName = 'fake-bucket';
const mockObjectKey = 'object/key';

beforeEach(() => {
  AWSMock.setSDKInstance(AWS);
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

afterEach(() => {
  reset();
  AWSMock.restore();
});

test('basic use', async () => {
  // GIVEN
  const mockLicense = 'MockLicense-1.0';
  AWSMock.mock(
    'S3',
    'getObject',
    (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
      try {
        expect(req).toEqual({ Bucket: mockBucketName, Key: mockObjectKey });
        cb(null, { Body: JSON.stringify([mockLicense]) });
      } catch (e: any) {
        cb(e);
      }
    }
  );

  // WHEN
  const licenseList = await LicenseListClient.newClient();

  // THEN
  expect(licenseList.lookup(Case.random(mockLicense))).toBe(mockLicense);
  expect(licenseList.lookup('NotInList')).toBeUndefined();
});

test('empty list', async () => {
  // GIVEN
  AWSMock.mock(
    'S3',
    'getObject',
    (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
      try {
        expect(req).toEqual({ Bucket: mockBucketName, Key: mockObjectKey });
        cb(null, { Body: JSON.stringify([]) });
      } catch (e: any) {
        cb(e);
      }
    }
  );

  // WHEN
  const licenseList = await LicenseListClient.newClient();

  // THEN
  expect(licenseList.lookup('NotInList')).toBeUndefined();
});

test('absent list', async () => {
  // GIVEN
  AWSMock.mock(
    'S3',
    'getObject',
    (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
      try {
        expect(req).toEqual({ Bucket: mockBucketName, Key: mockObjectKey });
        cb(null, {});
      } catch (e: any) {
        cb(e);
      }
    }
  );

  // WHEN
  const licenseList = await LicenseListClient.newClient();

  // THEN
  expect(licenseList.lookup('NotInList')).toBeUndefined();
});

test('broken list', async () => {
  // GIVEN
  AWSMock.mock(
    'S3',
    'getObject',
    (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
      try {
        expect(req).toEqual({ Bucket: mockBucketName, Key: mockObjectKey });
        cb(null, { Body: JSON.stringify('{}', null, 2) });
      } catch (e: any) {
        cb(e);
      }
    }
  );

  // THEN
  return expect(LicenseListClient.newClient()).rejects.toThrowError(
    /Invalid format/
  );
});

type Response<T> = (err: AWS.AWSError | null, data?: T) => void;
