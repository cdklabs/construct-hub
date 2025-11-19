import { randomBytes } from 'crypto';
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../backend/package-stats/package-stats-aggregator.lambda';
import { stringToStream } from '../../streams';

const mockS3 = mockClient(S3Client);

let mockBucketName: string | undefined;
let mockStatsKey: string | undefined;

beforeEach(() => {
  mockS3.reset();
  process.env.STATS_BUCKET_NAME = mockBucketName =
    randomBytes(16).toString('base64');
  process.env.STATS_OBJECT_KEY = mockStatsKey = 'stats.json';
});

afterEach(() => {
  process.env.STATS_BUCKET_NAME = mockBucketName = undefined;
  process.env.STATS_OBJECT_KEY = mockStatsKey = undefined;
});

test('aggregates chunks and creates final stats', async () => {
  const chunk1Data = {
    'package-a': { downloads: { npm: 100 } },
    'package-b': { downloads: { npm: 200 } },
  };

  const chunk2Data = {
    'package-c': { downloads: { npm: 300 } },
  };

  mockS3
    .on(GetObjectCommand, { Key: 'stats-chunks/chunk-0.json' })
    .resolves({ Body: stringToStream(JSON.stringify(chunk1Data)) });

  mockS3
    .on(GetObjectCommand, { Key: 'stats-chunks/chunk-1.json' })
    .resolves({ Body: stringToStream(JSON.stringify(chunk2Data)) });

  mockS3.on(DeleteObjectCommand).resolves({});
  mockS3.on(PutObjectCommand).resolves({});

  const stepFunctionEvent = {
    processResults: [
      {
        Payload: {
          chunkIndex: 0,
          chunkKey: 'stats-chunks/chunk-0.json',
          packageCount: 2,
        },
      },
      {
        Payload: {
          chunkIndex: 1,
          chunkKey: 'stats-chunks/chunk-1.json',
          packageCount: 1,
        },
      },
    ],
  };

  await handler(stepFunctionEvent, {
    logGroupName: 'test',
    logStreamName: 'test',
    awsRequestId: 'test',
  } as any);

  // Verify final stats were uploaded
  expect(mockS3.commandCalls(PutObjectCommand)).toHaveLength(1);
  const putCall = mockS3.commandCalls(PutObjectCommand)[0];
  expect(putCall.args[0].input.Bucket).toBe(mockBucketName);
  expect(putCall.args[0].input.Key).toBe(mockStatsKey);

  const finalStats = JSON.parse(putCall.args[0].input.Body as string);
  expect(finalStats.packages).toEqual({
    'package-a': { downloads: { npm: 100 } },
    'package-b': { downloads: { npm: 200 } },
    'package-c': { downloads: { npm: 300 } },
  });
  expect(finalStats.updated).toBeDefined();

  // Verify chunks were cleaned up
  expect(mockS3.commandCalls(DeleteObjectCommand)).toHaveLength(2);
});
