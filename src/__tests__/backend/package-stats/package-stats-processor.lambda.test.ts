import { randomBytes } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import type { Got } from 'got';
import { handler } from '../../../backend/package-stats/package-stats-processor.lambda';

const mockS3 = mockClient(S3Client);

let mockBucketName: string | undefined;

jest.mock('got');

beforeEach(() => {
  mockS3.reset();
  process.env.STATS_BUCKET_NAME = mockBucketName =
    randomBytes(16).toString('base64');
});

afterEach(() => {
  process.env.STATS_BUCKET_NAME = mockBucketName = undefined;
});

test('processes chunk and stores results', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockGot = require('got') as jest.MockedFunction<Got>;

  mockGot.mockResolvedValue({
    body: JSON.stringify({
      'package-a': {
        downloads: 100,
        package: 'package-a',
        start: '2023-01-01',
        end: '2023-01-07',
      },
      'package-b': {
        downloads: 200,
        package: 'package-b',
        start: '2023-01-01',
        end: '2023-01-07',
      },
    }),
  } as any);

  const mockPutResult = {};
  mockS3.on(PutObjectCommand).resolves(mockPutResult);

  const result = await handler({
    packages: ['package-a', 'package-b'],
    chunkIndex: 0,
  });

  expect(result.chunkIndex).toBe(0);
  expect(result.chunkKey).toBe('stats-chunks/chunk-0.json');
  expect(result.packageCount).toBe(2);

  expect(mockS3.commandCalls(PutObjectCommand)).toHaveLength(1);
  const putCall = mockS3.commandCalls(PutObjectCommand)[0];
  expect(putCall.args[0].input.Bucket).toBe(mockBucketName);
  expect(putCall.args[0].input.Key).toBe('stats-chunks/chunk-0.json');

  const body = JSON.parse(putCall.args[0].input.Body as string);
  expect(body).toEqual({
    'package-a': { downloads: { npm: 100 } },
    'package-b': { downloads: { npm: 200 } },
  });
});
