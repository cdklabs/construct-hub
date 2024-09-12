import { randomBytes } from 'crypto';
import {
  GetObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import type { Got } from 'got';
import { handler } from '../../../backend/package-stats/package-stats.lambda';
import { stringToStream } from '../../streams';

const mockS3 = mockClient(S3Client);

let mockCatalogBucket: string | undefined;
let mockCatalogKey: string | undefined;
let mockBucketName: string | undefined;
let mockStatsKey: string | undefined;
jest.mock('got');

beforeEach(() => {
  mockS3.reset();
  process.env.CATALOG_BUCKET_NAME = mockCatalogBucket =
    randomBytes(16).toString('base64');
  process.env.CATALOG_OBJECT_KEY = mockCatalogKey = 'my-catalog.json';
  process.env.STATS_BUCKET_NAME = mockBucketName =
    randomBytes(16).toString('base64');
  process.env.STATS_OBJECT_KEY = mockStatsKey = 'my-stats.json';
});

afterEach(() => {
  process.env.CATALOG_BUCKET_NAME = mockCatalogBucket = undefined;
  process.env.CATALOG_OBJECT_KEY = mockCatalogKey = undefined;
  process.env.STATS_BUCKET_NAME = mockBucketName = undefined;
  process.env.STATS_OBJECT_KEY = mockStatsKey = undefined;
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
  packages: [initialScopePackageV2, initialNameV1, initialNameV2],
  updatedAt: new Date().toISOString(),
};
describe('full build', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockGot = require('got') as jest.MockedFunction<Got>;

  afterAll(() => {
    mockGot.mockRestore();
  });

  test('is successful', () => {
    // GIVEN
    mockS3.on(GetObjectCommand).callsFake((req) => {
      try {
        expect(req.Bucket).toBe(mockCatalogBucket);
      } catch (e) {
        throw new NotFound({
          $metadata: {},
          message: `Unexpected bucket in test, got: ${req.Bucket}`,
        });
      }

      if (req.Key === mockCatalogKey) {
        return { Body: stringToStream(JSON.stringify(initialCatalog)) };
      } else if (req.Key === mockStatsKey) {
        // suppose we are building for the first time
        throw new NoSuchKey({
          $metadata: {},
          message: `Pretend ${mockStatsKey} does not exist at the first build`,
        });
      } else {
        throw new NoSuchKey({
          $metadata: {},
          message: `Unexpected key in test, got: ${req.Key}`,
        });
      }
    });

    // two API calls to NPM downloads API since one of the packages is scoped
    // so the bulk API can't be used
    mockGot.mockImplementationOnce(
      () =>
        Promise.resolve({
          body: JSON.stringify({
            downloads: 1000,
            package: '@scope/package',
            start: 'start-date',
            end: 'end-date',
          }),
        }) as any
    );
    mockGot.mockImplementationOnce(
      () =>
        Promise.resolve({
          body: JSON.stringify({
            downloads: 2000,
            package: 'name',
            start: 'start-date',
            end: 'end-date',
          }),
        }) as any
    );

    const mockPutObjectResult: AWS.S3.PutObjectOutput = {};
    mockS3.on(PutObjectCommand).callsFake((req: PutObjectCommandInput) => {
      try {
        expect(req.Bucket).toBe(mockBucketName);
        expect(req.Key).toBe(mockStatsKey);
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
            name: {
              downloads: {
                npm: 2000,
              },
            },
          },
          updated: expect.anything(),
        });
        expect(Date.parse(body.updated)).toBeDefined();
      } catch (e) {
        throw new S3ServiceException({
          name: 'UnexpectedInput',
          $fault: 'client',
          $metadata: {},
          message: `Validation of test input failed`,
        });
      }
      return mockPutObjectResult;
    });

    // WHEN
    const result = handler({}, {
      /* context */
    } as any);

    // THEN
    return expect(result).resolves.toBe(mockPutObjectResult);
  });
});

test('errors if no catalog found', async () => {
  // GIVEN
  mockS3
    .on(GetObjectCommand, {
      Bucket: mockCatalogBucket,
      Key: mockCatalogKey,
    })
    .rejects(new NoSuchKey({ $metadata: {}, message: 'No such key' }));

  // THEN
  return expect(
    handler({}, {
      /* context */
    } as any)
  ).rejects.toThrow(/No catalog was found/);
});
