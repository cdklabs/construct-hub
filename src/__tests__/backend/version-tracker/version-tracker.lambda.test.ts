import { randomBytes } from 'crypto';
import * as AWS from 'aws-sdk';
import type { AWSError } from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import * as aws from '../../../backend/shared/aws.lambda-shared';
import { ENV_PACKAGE_DATA_BUCKET_NAME, ENV_PACKAGE_DATA_KEY_PREFIX, ENV_VERSION_TRACKER_BUCKET_NAME, ENV_VERSION_TRACKER_OBJECT_KEY } from '../../../backend/version-tracker/constants';
import { handler } from '../../../backend/version-tracker/version-tracker.lambda';

let mockVersionTrackerBucket: string | undefined;
let mockVersionTrackerKey: string | undefined;
let mockPackageDataBucket: string | undefined;
let mockPackageDataKey: string | undefined;

beforeEach((done) => {
  process.env[ENV_VERSION_TRACKER_BUCKET_NAME] = mockVersionTrackerBucket = randomBytes(16).toString('base64');
  process.env[ENV_VERSION_TRACKER_OBJECT_KEY] = mockVersionTrackerKey = 'the-versions.json';
  process.env[ENV_PACKAGE_DATA_BUCKET_NAME] = mockPackageDataBucket = randomBytes(16).toString('base64');
  process.env[ENV_PACKAGE_DATA_KEY_PREFIX] = mockPackageDataKey = 'the-data/';
  AWSMock.setSDKInstance(AWS);
  done();
});

afterEach((done) => {
  AWSMock.restore();
  aws.reset();
  process.env[ENV_VERSION_TRACKER_BUCKET_NAME] = mockVersionTrackerBucket = undefined;
  process.env[ENV_VERSION_TRACKER_OBJECT_KEY] = mockVersionTrackerKey = undefined;
  process.env[ENV_PACKAGE_DATA_BUCKET_NAME] = mockPackageDataBucket = undefined;
  process.env[ENV_PACKAGE_DATA_KEY_PREFIX] = mockPackageDataKey = undefined;
  done();
});

test('happy path', () => {
  // GIVEN
  mockListObjects({
    [mockPackageDataKey!]: [
      `${mockPackageDataKey}@scope/`,
      `${mockPackageDataKey}name/`,
    ],
    [`${mockPackageDataKey}@scope/`]: [
      `${mockPackageDataKey}@scope/package/`,
    ],
    [`${mockPackageDataKey}@scope/package/`]: [
      `${mockPackageDataKey}@scope/package/v0.0.1/`,
      `${mockPackageDataKey}@scope/package/v0.0.2/`,
      `${mockPackageDataKey}@scope/package/v0.0.3/`,
    ],
    [`${mockPackageDataKey}name/`]: [
      `${mockPackageDataKey}name/v1.0.0/`,
      `${mockPackageDataKey}name/v1.0.1/`,
      `${mockPackageDataKey}name/v1.1.0/`,
    ],
  });
  const mockPutObjectResult = mockPutObject({
    '@scope/package': ['0.0.1', '0.0.2', '0.0.3'],
    'name': ['1.0.0', '1.0.1', '1.1.0'],
  });

  // WHEN
  const result = handler({}, { /* context */ } as any);

  // THEN
  return expect(result).resolves.toBe(mockPutObjectResult);
});

function mockListObjects(prefixes: Record<string, string[]>) {
  AWSMock.mock('S3', 'listObjectsV2', (req: AWS.S3.ListObjectsV2Request, cb: Response<AWS.S3.ListObjectsV2Output>) => {
    try {
      expect(req.Bucket).toBe(mockPackageDataBucket);
      expect(req.Delimiter).toBe('/');
      expect(req.ContinuationToken).toBeUndefined();
      expect(Object.keys(prefixes).includes(req.Prefix!)).toBe(true);
    } catch (e) {
      return cb(e as AWSError);
    }
    return cb(null, {
      CommonPrefixes: prefixes[req.Prefix!].map((prefix) => ({ Prefix: prefix })),
    });
  });
}

function mockPutObject(packages: Record<string, string[]>): AWS.S3.PutObjectOutput {
  const mockPutObjectResult: AWS.S3.PutObjectOutput = {};

  const numPackages = Object.keys(packages).length;
  const numVersions = Object.values(packages)
    .map((versions) => versions.length)
    .reduce((x, y) => x + y);
  AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(mockVersionTrackerBucket);
      expect(req.Key).toBe(mockVersionTrackerKey);
      expect(req.ContentType).toBe('application/json');
      expect(req.Metadata).toHaveProperty('Package-Count', numPackages.toString());
      expect(req.Metadata).toHaveProperty('Version-Count', numVersions.toString());
      const body = JSON.parse(req.Body?.toString('utf-8') ?? 'null');
      expect(body).toEqual({
        packages,
        updatedAt: expect.anything(),
      });
      expect(Date.parse(body.updatedAt)).toBeDefined();
    } catch (e) {
      return cb(e as AWSError);
    }
    return cb(null, mockPutObjectResult);
  });
  return mockPutObjectResult;
}

type Response<T> = (err: AWS.AWSError | null, data?: T) => void;
