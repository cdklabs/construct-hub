import { randomBytes } from 'crypto';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../backend/package-stats/package-stats-chunker.lambda';
import { stringToStream } from '../../streams';

const mockS3 = mockClient(S3Client);

let mockCatalogBucket: string | undefined;
let mockCatalogKey: string | undefined;

beforeEach(() => {
  mockS3.reset();
  process.env.CATALOG_BUCKET_NAME = mockCatalogBucket =
    randomBytes(16).toString('base64');
  process.env.CATALOG_OBJECT_KEY = mockCatalogKey = 'catalog.json';
});

afterEach(() => {
  process.env.CATALOG_BUCKET_NAME = mockCatalogBucket = undefined;
  process.env.CATALOG_OBJECT_KEY = mockCatalogKey = undefined;
});

test('chunks packages correctly', async () => {
  const catalog = {
    packages: Array.from({ length: 250 }, (_, i) => ({
      name: `package-${i}`,
      version: '1.0.0',
    })),
    updatedAt: new Date().toISOString(),
  };

  mockS3.on(GetObjectCommand).callsFake((req) => {
    expect(req.Bucket).toBe(mockCatalogBucket);
    expect(req.Key).toBe(mockCatalogKey);
    return { Body: stringToStream(JSON.stringify(catalog)) };
  });

  const result = await handler();

  expect(result.chunks).toHaveLength(3); // 250 packages / 100 per chunk = 3 chunks
  expect(result.chunks[0].packages).toHaveLength(100);
  expect(result.chunks[1].packages).toHaveLength(100);
  expect(result.chunks[2].packages).toHaveLength(50);
  expect(result.chunks[0].chunkIndex).toBe(0);
  expect(result.chunks[1].chunkIndex).toBe(1);
  expect(result.chunks[2].chunkIndex).toBe(2);
});

test('removes duplicate package names', async () => {
  const catalog = {
    packages: [
      { name: 'package-a', version: '1.0.0' },
      { name: 'package-a', version: '2.0.0' },
      { name: 'package-b', version: '1.0.0' },
    ],
    updatedAt: new Date().toISOString(),
  };

  mockS3.on(GetObjectCommand).callsFake((req) => {
    expect(req.Bucket).toBe(mockCatalogBucket);
    expect(req.Key).toBe(mockCatalogKey);
    return { Body: stringToStream(JSON.stringify(catalog)) };
  });

  const result = await handler();

  expect(result.chunks).toHaveLength(1);
  expect(result.chunks[0].packages).toEqual(['package-a', 'package-b']);
});
