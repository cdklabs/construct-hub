import { randomBytes } from 'crypto';
import { PassThrough } from 'stream';
import * as zip from 'zlib';

import * as AWS from 'aws-sdk';
import { AWSError } from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import * as tar from 'tar-stream';

import { DenyListMap } from '../../../backend';
import { handler } from '../../../backend/catalog-builder/catalog-builder.lambda';
import { ENV_DENY_LIST_BUCKET_NAME, ENV_DENY_LIST_OBJECT_KEY } from '../../../backend/deny-list/constants';
import { CatalogBuilderInput } from '../../../backend/payload-schema';
import * as aws from '../../../backend/shared/aws.lambda-shared';
import * as constants from '../../../backend/shared/constants';

let mockBucketName: string | undefined;

const MOCK_DENY_LIST_BUCKET = 'deny-list-bucket-name';
const MOCK_DENY_LIST_OBJECT = 'my-deny-list.json';
const MOCK_DENY_LIST_MAP: DenyListMap = {
  'name/v0.0.0-pre': {
    packageName: 'name',
    version: '0.0.0-pre',
    reason: 'blocked version',
  },
  '@foo/blocked': {
    packageName: '@foo/blocked',
    reason: 'block all version of this package please',
  },
};

beforeEach((done) => {
  process.env.BUCKET_NAME = mockBucketName = randomBytes(16).toString('base64');
  process.env[ENV_DENY_LIST_BUCKET_NAME] = MOCK_DENY_LIST_BUCKET;
  process.env[ENV_DENY_LIST_OBJECT_KEY] = MOCK_DENY_LIST_OBJECT;

  AWSMock.setSDKInstance(AWS);
  done();
});

afterEach((done) => {
  AWSMock.restore();
  aws.reset();
  process.env.BUCKET_NAME = mockBucketName = undefined;
  delete process.env[ENV_DENY_LIST_BUCKET_NAME];
  delete process.env[ENV_DENY_LIST_OBJECT_KEY];
  done();
});

test('initial build', () => {
  // GIVEN
  const npmMetadata = { date: 'Thu, 17 Jun 2021 01:52:04 GMT' };

  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
    const denyListResponse = tryMockDenyList(req);
    if (denyListResponse) {
      return cb(null, denyListResponse);
    }

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
  // this is the suffix that triggers the catalog builder.
  const docsSuffix = constants.DOCS_KEY_SUFFIX_TYPESCRIPT;
  const mockFirstPage: AWS.S3.ObjectList = [
    { Key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v1.2.3${constants.ASSEMBLY_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v1.2.3${constants.PACKAGE_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v1.2.3${docsSuffix}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v1.2.3${constants.ASSEMBLY_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v1.2.3${constants.PACKAGE_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v1.2.3${docsSuffix}` },
  ];
  const mockSecondPage: AWS.S3.ObjectList = [
    { Key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v1.0.0${constants.ASSEMBLY_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v1.0.0${constants.PACKAGE_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v1.0.0${docsSuffix}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v2.0.0-pre${constants.ASSEMBLY_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v2.0.0-pre${constants.PACKAGE_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v2.0.0-pre${docsSuffix}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v0.0.0-pre${constants.ASSEMBLY_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v0.0.0-pre${constants.PACKAGE_KEY_SUFFIX}` },
    { Key: `${constants.STORAGE_KEY_PREFIX}name/v0.0.0-pre${docsSuffix}` },
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
  AWSMock.mock('S3', 'headObject', (req: AWS.S3.HeadObjectRequest, cb: Response<AWS.S3.HeadObjectOutput>) => {
    const existingKeys = new Set([...mockFirstPage, ...mockSecondPage].map((obj) => obj.Key!));
    if (req.Bucket === mockBucketName && existingKeys.has(req.Key)) {
      return cb(null, {});
    }
    class NotFound extends Error implements AWSError {
      public code = 'NotFound';
      public message = 'Not Found';
      public time = new Date();
    }
    return cb(new NotFound());
  });
  const mockPutObjectResult: AWS.S3.PutObjectOutput = {};
  AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(mockBucketName);
      expect(req.Key).toBe(constants.CATALOG_KEY);
      expect(req.ContentType).toBe('application/json');
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
  const result = handler({
    package: {
      key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v1.2.2${constants.ASSEMBLY_KEY_SUFFIX}`,
      versionId: 'VersionID',
    },
  }, { /* context */ } as any);

  // THEN
  return expect(result).resolves.toBe(mockPutObjectResult);
});

describe('incremental build', () => {

  const shortNpmMetadata = { date: 'Thu, 17 Jun 2021 01:52:04 GMT' };
  const npmMetadata = { ...shortNpmMetadata, licenseText: 'Should not be in catalog.json!' };
  const initialScopePackageV2 = {
    description: 'Package @scope/package, version 2.3.4',
    languages: { foo: 'bar' },
    major: 2,
    metadata: shortNpmMetadata,
    name: '@scope/package',
    version: '2.3.4',
  };
  const initialNameV1 = {
    description: 'Package name, version 1.0.0',
    languages: { foo: 'bar' },
    major: 1,
    metadata: shortNpmMetadata,
    name: 'name',
    version: '1.0.0',
  };
  const initialNameV2 = {
    description: 'Package name, version 2.0.0-pre.10',
    languages: { foo: 'bar' },
    major: 2,
    metadata: shortNpmMetadata,
    name: 'name',
    version: '2.0.0-pre.10',
  };
  const initialPackages = [initialScopePackageV2, initialNameV1, initialNameV2];
  const initialCatalog = {
    packages: [
      initialScopePackageV2,
      // Adding some junk in there to validate it is cleaned up...
      { ...initialNameV1, metadata: { ...initialNameV1.metadata, licenseText: npmMetadata.licenseText } },
      initialNameV2,
    ],
    updatedAt: new Date().toISOString(),
  };

  test('new major version of @scope/package', () => {
    // GIVEN
    AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
      const denyListResponse = tryMockDenyList(req);
      if (denyListResponse) {
        return cb(null, denyListResponse);
      }

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
          Body: JSON.stringify(initialCatalog, null, 2),
        });
      } else {
        return cb(new NoSuchKeyError());
      }
    });

    const event: CatalogBuilderInput = {
      package: {
        key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v1.2.3${constants.PACKAGE_KEY_SUFFIX}`,
      },
    };
    const mockPutObjectResult: AWS.S3.PutObjectOutput = {};
    AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
      try {
        expect(req.Bucket).toBe(mockBucketName);
        expect(req.Key).toBe(constants.CATALOG_KEY);
        expect(req.ContentType).toBe('application/json');
        expect(req.Metadata).toHaveProperty('Package-Count', '4');
        const body = JSON.parse(req.Body?.toString('utf-8') ?? 'null');
        expect(body.packages).toEqual([
          initialScopePackageV2,
          {
            description: 'Package @scope/package, version 1.2.3',
            languages: { foo: 'bar' },
            major: 1,
            metadata: shortNpmMetadata,
            name: '@scope/package',
            version: '1.2.3',
          },
          initialNameV1,
          initialNameV2,
        ]);
        expect(Date.parse(body.updatedAt)).toBeDefined();
      } catch (e) {
        return cb(e);
      }
      return cb(null, mockPutObjectResult);
    });

    // WHEN
    const result = handler(event, { /* context */ } as any);

    // THEN
    return expect(result).resolves.toBe(mockPutObjectResult);
  });

  test('updated un-scoped package version', () => {
    // GIVEN
    AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
      const denyListResponse = tryMockDenyList(req);
      if (denyListResponse) {
        return cb(null, denyListResponse);
      }

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
          Body: JSON.stringify(initialCatalog, null, 2),
        });
      } else {
        return cb(new NoSuchKeyError());
      }
    });

    const event: CatalogBuilderInput = {
      package: {
        key: `${constants.STORAGE_KEY_PREFIX}name/v1.2.3${constants.PACKAGE_KEY_SUFFIX}`,
      },
    };
    const mockPutObjectResult: AWS.S3.PutObjectOutput = {};
    AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
      try {
        expect(req.Bucket).toBe(mockBucketName);
        expect(req.Key).toBe(constants.CATALOG_KEY);
        expect(req.ContentType).toBe('application/json');
        expect(req.Metadata).toHaveProperty('Package-Count', '3');
        const body = JSON.parse(req.Body?.toString('utf-8') ?? 'null');
        expect(body.packages).toEqual([
          initialScopePackageV2,
          { ... initialNameV1, description: 'Package name, version 1.2.3', version: '1.2.3' },
          initialNameV2,
        ]);
        expect(Date.parse(body.updatedAt)).toBeDefined();
      } catch (e) {
        return cb(e);
      }
      return cb(null, mockPutObjectResult);
    });

    // WHEN
    const result = handler(event, { /* context */ } as any);

    // THEN
    return expect(result).resolves.toBe(mockPutObjectResult);
  });

  test('ignored "older" minor version of @scope/package', () => {
    // GIVEN
    AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
      const denyListResponse = tryMockDenyList(req);
      if (denyListResponse) {
        return cb(null, denyListResponse);
      }

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
          Body: JSON.stringify(initialCatalog, null, 2),
        });
      } else {
        return cb(new NoSuchKeyError());
      }
    });

    const event: CatalogBuilderInput = {
      package: {
        key: `${constants.STORAGE_KEY_PREFIX}@scope/package/v2.0.5${constants.PACKAGE_KEY_SUFFIX}`,
      },
    };
    const mockPutObjectResult: AWS.S3.PutObjectOutput = {};
    AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
      try {
        expect(req.Bucket).toBe(mockBucketName);
        expect(req.Key).toBe(constants.CATALOG_KEY);
        expect(req.ContentType).toBe('application/json');
        expect(req.Metadata).toHaveProperty('Package-Count', '3');
        const body = JSON.parse(req.Body?.toString('utf-8') ?? 'null');
        expect(body.packages).toEqual(initialPackages);
        expect(Date.parse(body.updatedAt)).toBeDefined();
      } catch (e) {
        return cb(e);
      }
      return cb(null, mockPutObjectResult);
    });

    // WHEN
    const result = handler(event, { /* context */ } as any);

    // THEN
    return expect(result).resolves.toBe(mockPutObjectResult);
  });

  test('ignored "older" pre-release of package', () => {
    // GIVEN
    AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
      const denyListResponse = tryMockDenyList(req);
      if (denyListResponse) {
        return cb(null, denyListResponse);
      }

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
          Body: JSON.stringify(initialCatalog, null, 2),
        });
      } else {
        return cb(new NoSuchKeyError());
      }
    });

    const event: CatalogBuilderInput = {
      package: {
        key: `${constants.STORAGE_KEY_PREFIX}name/v2.0.0-pre.1${constants.PACKAGE_KEY_SUFFIX}`,
      },
    };
    const mockPutObjectResult: AWS.S3.PutObjectOutput = {};
    AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
      try {
        expect(req.Bucket).toBe(mockBucketName);
        expect(req.Key).toBe(constants.CATALOG_KEY);
        expect(req.ContentType).toBe('application/json');
        expect(req.Metadata).toHaveProperty('Package-Count', '3');
        const body = JSON.parse(req.Body?.toString('utf-8') ?? 'null');
        expect(body.packages).toEqual(initialPackages);
        expect(Date.parse(body.updatedAt)).toBeDefined();
      } catch (e) {
        return cb(e);
      }
      return cb(null, mockPutObjectResult);
    });

    // WHEN
    const result = handler(event, { /* context */ } as any);

    // THEN
    return expect(result).resolves.toBe(mockPutObjectResult);
  });

  test('ignored denied list package', () => {
    // GIVEN
    AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
      const denyListResponse = tryMockDenyList(req);
      if (denyListResponse) {
        return cb(null, denyListResponse);
      }

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
          Body: JSON.stringify(initialCatalog, null, 2),
        });
      } else {
        return cb(new NoSuchKeyError());
      }
    });

    const event: CatalogBuilderInput = {
      package: {
        key: `${constants.STORAGE_KEY_PREFIX}@foo/blocked/v1.1.0${constants.PACKAGE_KEY_SUFFIX}`,
      },
    };
    const mockPutObjectResult: AWS.S3.PutObjectOutput = {};
    AWSMock.mock('S3', 'putObject', (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
      try {
        expect(req.Bucket).toBe(mockBucketName);
        expect(req.Key).toBe(constants.CATALOG_KEY);
        expect(req.ContentType).toBe('application/json');
        expect(req.Metadata).toHaveProperty('Package-Count', '3');
        const body = JSON.parse(req.Body?.toString('utf-8') ?? 'null');
        expect(body.packages).toEqual(initialPackages);
        expect(Date.parse(body.updatedAt)).toBeDefined();
      } catch (e) {
        return cb(e);
      }
      return cb(null, mockPutObjectResult);
    });

    // WHEN
    const result = handler(event, { /* context */ } as any);

    // THEN
    return expect(result).resolves.toBe(mockPutObjectResult);
  });
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

function tryMockDenyList(req: AWS.S3.GetObjectRequest) {
  if (req.Bucket === MOCK_DENY_LIST_BUCKET && req.Key === MOCK_DENY_LIST_OBJECT) {
    return { Body: JSON.stringify(MOCK_DENY_LIST_MAP) };
  } else {
    return undefined;
  }
}
