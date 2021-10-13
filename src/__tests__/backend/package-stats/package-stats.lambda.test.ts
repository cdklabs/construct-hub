import { randomBytes } from 'crypto';

import * as AWS from 'aws-sdk';
import type { AWSError } from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import type { Got } from 'got';

import { handler } from '../../../backend/package-stats/package-stats.lambda';
import * as aws from '../../../backend/shared/aws.lambda-shared';
import * as constants from '../../../backend/shared/constants';

let mockBucketName: string | undefined;
jest.mock('got');

beforeEach((done) => {
  process.env.BUCKET_NAME = mockBucketName = randomBytes(16).toString('base64');
  AWSMock.setSDKInstance(AWS);
  done();
});

afterEach((done) => {
  AWSMock.restore();
  aws.reset();
  process.env.BUCKET_NAME = mockBucketName = undefined;
  done();
});

const initialScopePackageV2 = {
  description: 'Package @scope/package, version 2.3.4',
  name: '@scope/package',
  version: '2.3.4',
};
const initialNameV1 = {
  description: 'Package name, version 1.0.0',
  name: 'name',
  version: '1.0.0',
};
const initialNameV2 = {
  description: 'Package name, version 2.0.0-pre.10',
  name: 'name',
  version: '2.0.0-pre.10',
};
const initialCatalog = {
  packages: [
    initialScopePackageV2,
    initialNameV1,
    initialNameV2,
  ],
  updatedAt: new Date().toISOString(),
};

test('full build', () => {
  // GIVEN
  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
    } catch (e) {
      return cb(e as AWSError);
    }

    if (req.Key.endsWith(constants.CATALOG_KEY)) {
      return cb(null, { Body: JSON.stringify(initialCatalog) });
    } else if (req.Key.endsWith(constants.STATS_KEY)) {
      // suppose we are building for the first time
      return cb(new NoSuchKeyError());
    } else {
      return cb(new NoSuchKeyError());
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockGot = require('got') as jest.MockedFunction<Got>;
  // two API calls to NPM downloads API since one of the packages is scoped
  // so the bulk API can't be used
  mockGot.mockImplementationOnce(() => Promise.resolve({
    body: JSON.stringify({
      downloads: 1000,
      package: '@scope/package',
      start: 'start-date',
      end: 'end-date',
    }),
  }) as any);
  mockGot.mockImplementationOnce(() => Promise.resolve({
    body: JSON.stringify({
      downloads: 2000,
      package: 'name',
      start: 'start-date',
      end: 'end-date',
    }),
  }) as any);

  const mockPutObjectResult: AWS.S3.PutObjectOutput = {};
  AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
      expect(req.Key).toBe(constants.STATS_KEY);
      expect(req.ContentType).toBe('application/json');
      expect(req.Metadata).toHaveProperty('Package-Stats-Count', '2');
      const body = JSON.parse(req.Body?.toString('utf-8') ?? 'null');
      expect(body).toEqual({
        packages: {
          '@scope/package': {
            downloads: {
              npm: 1000,
            },
          },
          'name': {
            downloads: {
              npm: 2000,
            },
          },
        },
        updated: expect.anything(),
      });
      expect(Date.parse(body.updatedAt)).toBeDefined();
    } catch (e) {
      return cb(e as AWSError);
    }
    return cb(null, mockPutObjectResult);
  });

  // WHEN
  const result = handler({}, { /* context */ } as any);

  // THEN
  return expect(result).resolves.toBe(mockPutObjectResult);
});

test('errors if no catalog found', () => {
  // GIVEN
  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
      expect(req.Key.endsWith(constants.CATALOG_KEY));
      return cb(new NoSuchKeyError());
    } catch (e) {
      return cb(e as AWSError);
    }
  });

  // THEN
  return expect(handler({}, { /* context */ } as any)).rejects.toMatch(/No catalog data found/);
});

type Response<T> = (err: AWS.AWSError | null, data?: T) => void;

class NoSuchKeyError extends Error implements AWS.AWSError {
  public code = 'NoSuchKey';
  public time = new Date();

  public retryable?: boolean | undefined;
  public statusCode?: number | undefined;
  public hostname?: string | undefined;
  public region?: string | undefined;
  public retryDelay?: number | undefined;
  public requestId?: string | undefined;
  public extendedRequestId?: string | undefined;
  public cfId?: string | undefined;
  public originalError?: Error | undefined;
}
