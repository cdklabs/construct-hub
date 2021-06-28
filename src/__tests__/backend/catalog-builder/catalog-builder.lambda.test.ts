import { randomBytes } from 'crypto';
import { PassThrough } from 'stream';
import * as zip from 'zlib';

import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import * as tar from 'tar-stream';

import { handler } from '../../../backend/catalog-builder/catalog-builder.lambda';
import * as aws from '../../../backend/shared/aws.lambda-shared';
import * as constants from '../../../backend/shared/constants.lambda-shared';

let mockBucketName: string | undefined;

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

test('no indexed packages', () => {
  // GIVEN
  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<never>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
      expect(req.Key).toBe(constants.CATALOG_KEY);
    } catch (e) {
      return cb(e);
    }
    return cb(new NoSuchKeyError());
  });
  AWSMock.mock('S3', 'listObjectsV2', (req: AWS.S3.ListObjectsV2Request, cb: Response<AWS.S3.ListObjectsV2Output>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
      expect(req.Prefix).toBe(constants.STORAGE_KEY_PREFIX);
      expect(req.ContinuationToken).toBeUndefined();
    } catch (e) {
      return cb(e);
    }
    return cb(null, {});
  });
  const mockPutObjectResult: AWS.S3.PutObjectOutput = {};
  AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
      expect(req.Key).toBe(constants.CATALOG_KEY);
      expect(req.ContentType).toBe('text/json');
      const body = JSON.parse(req.Body?.toString('utf-8') ?? 'null');
      expect(body.packages).toEqual([]);
      expect(Date.parse(body.updatedAt)).toBeDefined();
    } catch (e) {
      return cb(e);
    }
    return cb(null, mockPutObjectResult);
  });

  // WHEN
  const result = handler({} as any, { /* context */ } as any);

  // THEN
  return expect(result).resolves.toBe(mockPutObjectResult);
});

test('initial build', () => {
  // GIVEN

  const npmMetadata = { date: 'Thu, 17 Jun 2021 01:52:04 GMT' };

  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
    } catch (e) {
      return cb(e);
    }

    if (req.Key.endsWith(constants.METADATA_KEY_SUFFIX)) {
      return cb(null, { Body: JSON.stringify(npmMetadata) });
    }
    const matches = new RegExp(`^${constants.STORAGE_KEY_PREFIX}((?:@[^/]+/)?[^/]+)/v([^/]+)/.*$`).exec(req.Key);
    if (matches != null) {
      mockNpmPackage(matches[1], matches[2]).then(
        (pack) => cb(null, { Body: pack }),
        cb,
      );
    } else {
      return cb(new NoSuchKeyError());
    }
  });
  const mockFirstPage: AWS.S3.ObjectList = [
    { Key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v1.2.3${constants.ASSEMBLY_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v1.2.3${constants.PACKAGE_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v1.2.3${constants.ASSEMBLY_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v1.2.3${constants.PACKAGE_KEY_SUFFIX}` },
  ];
  const mockSecondPage: AWS.S3.ObjectList = [
    { Key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v1.0.0${constants.ASSEMBLY_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v1.0.0${constants.PACKAGE_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v2.0.0-pre${constants.ASSEMBLY_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v2.0.0-pre${constants.PACKAGE_KEY_SUFFIX}` },
  ];
  AWSMock.mock('S3', 'listObjectsV2', (req: AWS.S3.ListObjectsV2Request, cb: Response<AWS.S3.ListObjectsV2Output>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
      expect(req.Prefix).toBe(constants.STORAGE_KEY_PREFIX);
    } catch (e) {
      return cb(e);
    }
    if (req.ContinuationToken == null) {
      return cb(null, { Contents: mockFirstPage, NextContinuationToken: 'next' });
    }
    try {
      expect(req.ContinuationToken).toBe('next');
    } catch (e) {
      return cb(e);
    }
    return cb(null, { Contents: mockSecondPage });
  });
  const mockPutObjectResult: AWS.S3.PutObjectOutput = {};
  AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
      expect(req.Key).toBe(constants.CATALOG_KEY);
      expect(req.ContentType).toBe('text/json');
      expect(req.Metadata).toHaveProperty('Package-Count', '3');
      const body = JSON.parse(req.Body?.toString('utf-8') ?? 'null');
      expect(body.packages).toEqual([
        {
          description: 'Package @scope/package, version 1.2.3',
          languages: { foo: 'bar' },
          major: 1,
          metadata: npmMetadata,
          name: '@scope/package',
          version: '1.2.3',
        },
        {
          description: 'Package name, version 1.2.3',
          languages: { foo: 'bar' },
          major: 1,
          metadata: npmMetadata,
          name: 'name',
          version: '1.2.3',
        },
        {
          description: 'Package name, version 2.0.0-pre',
          languages: { foo: 'bar' },
          major: 2,
          metadata: npmMetadata,
          name: 'name',
          version: '2.0.0-pre',
        },
      ]);
      expect(Date.parse(body.updatedAt)).toBeDefined();
    } catch (e) {
      return cb(e);
    }
    return cb(null, mockPutObjectResult);
  });

  // WHEN
  const result = handler({} as any, { /* context */ } as any);

  // THEN
  return expect(result).resolves.toBe(mockPutObjectResult);
});

test('incremental build', () => {

  const npmMetadata = { date: 'Thu, 17 Jun 2021 01:52:04 GMT' };

  // GIVEN
  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
    } catch (e) {
      return cb(e);
    }

    if (req.Key.endsWith(constants.METADATA_KEY_SUFFIX)) {
      return cb(null, { Body: JSON.stringify(npmMetadata) });
    }

    const matches = new RegExp(`^${constants.STORAGE_KEY_PREFIX}((?:@[^/]+/)?[^/]+)/v([^/]+)/.*$`).exec(req.Key);
    if (matches != null) {
      mockNpmPackage(matches[1], matches[2]).then(
        (pack) => cb(null, { Body: pack }),
        cb,
      );
    } else if (req.Key === constants.CATALOG_KEY) {
      return cb(null, {
        Body: JSON.stringify({
          packages: [
            {
              description: 'Package @scope/package, version 2.3.4',
              languages: { foo: 'bar' },
              major: 2,
              metadata: npmMetadata,
              name: '@scope/package',
              version: '2.3.4',
            },
            {
              description: 'Package name, version 1.0.0',
              languages: { foo: 'bar' },
              major: 1,
              metadata: npmMetadata,
              name: 'name',
              version: '1.0.0',
            },
            {
              description: 'Package name, version 2.0.0-pre.10',
              languages: { foo: 'bar' },
              major: 2,
              metadata: npmMetadata,
              name: 'name',
              version: '2.0.0-pre.10',
            },
          ],
          updatedAt: new Date().toISOString(),
        }, null, 2),
      });
    } else {
      return cb(new NoSuchKeyError());
    }
  });
  const mockFirstPage: AWS.S3.ObjectList = [
    { Key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v1.2.3${constants.PACKAGE_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v1.2.3${constants.PACKAGE_KEY_SUFFIX}` },
  ];
  const mockSecondPage: AWS.S3.ObjectList = [
    { Key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v2.0.5${constants.PACKAGE_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v2.0.0-pre.1${constants.PACKAGE_KEY_SUFFIX}` },
  ];
  AWSMock.mock('S3', 'listObjectsV2', (req: AWS.S3.ListObjectsV2Request, cb: Response<AWS.S3.ListObjectsV2Output>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
      expect(req.Prefix).toBe(constants.STORAGE_KEY_PREFIX);
    } catch (e) {
      return cb(e);
    }
    if (req.ContinuationToken == null) {
      return cb(null, { Contents: mockFirstPage, NextContinuationToken: 'next' });
    }
    try {
      expect(req.ContinuationToken).toBe('next');
    } catch (e) {
      return cb(e);
    }
    return cb(null, { Contents: mockSecondPage });
  });
  const mockPutObjectResult: AWS.S3.PutObjectOutput = {};
  AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
      expect(req.Key).toBe(constants.CATALOG_KEY);
      expect(req.ContentType).toBe('text/json');
      expect(req.Metadata).toHaveProperty('Package-Count', '4');
      const body = JSON.parse(req.Body?.toString('utf-8') ?? 'null');
      expect(body.packages).toEqual([
        {
          description: 'Package @scope/package, version 2.3.4',
          languages: { foo: 'bar' },
          major: 2,
          metadata: npmMetadata,
          name: '@scope/package',
          version: '2.3.4',
        },
        {
          description: 'Package @scope/package, version 1.2.3',
          languages: { foo: 'bar' },
          major: 1,
          metadata: npmMetadata,
          name: '@scope/package',
          version: '1.2.3',
        },
        {
          description: 'Package name, version 1.2.3',
          languages: { foo: 'bar' },
          major: 1,
          metadata: npmMetadata,
          name: 'name',
          version: '1.2.3',
        },
        {
          description: 'Package name, version 2.0.0-pre.10',
          languages: { foo: 'bar' },
          major: 2,
          metadata: npmMetadata,
          name: 'name',
          version: '2.0.0-pre.10',
        },
      ]);
      expect(Date.parse(body.updatedAt)).toBeDefined();
    } catch (e) {
      return cb(e);
    }
    return cb(null, mockPutObjectResult);
  });

  // WHEN
  const result = handler({} as any, { /* context */ } as any);

  // THEN
  return expect(result).resolves.toBe(mockPutObjectResult);
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

function mockNpmPackage(name: string, version: string) {
  const packageJson = {
    name,
    version,
    description: `Package ${name}, version ${version}`,
    jsii: {
      targets: { foo: 'bar' },
    },
  };

  const tarball = tar.pack();
  tarball.entry({ name: 'package/ignore-me.txt' }, 'Ignore Me!');
  tarball.entry({ name: 'package/package.json' }, JSON.stringify(packageJson, null, 2));
  tarball.finalize();

  const gzip = zip.createGzip();
  tarball.pipe(gzip);

  const passthrough = new PassThrough();
  gzip.pipe(passthrough);

  return new Promise<Buffer>((ok) => {
    const chunks = new Array<Buffer>();
    passthrough.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    passthrough.once('end', () => {
      ok(Buffer.concat(chunks));
    });
  });
}
