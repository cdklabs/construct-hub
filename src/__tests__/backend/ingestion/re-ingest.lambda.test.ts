import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import {
  METADATA_KEY_SUFFIX,
  PACKAGE_KEY_SUFFIX,
  STORAGE_KEY_PREFIX,
} from '../../../backend/shared/constants';
import type { requireEnv } from '../../../backend/shared/env.lambda-shared';
import type { now } from '../../../backend/shared/time.lambda-shared';
import { stringToStream } from '../../streams';

jest.mock('../../../backend/shared/env.lambda-shared');
jest.mock('../../../backend/shared/time.lambda-shared');

const mockBucketName = 'fake-bucket-name';
const mockQueueUrl = 'https://dummy-queue.url';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockRequireEnv = require('../../../backend/shared/env.lambda-shared')
  .requireEnv as jest.MockedFunction<typeof requireEnv>;
mockRequireEnv.mockImplementation((name) => {
  if (name === 'BUCKET_NAME') {
    return mockBucketName;
  }
  if (name === 'QUEUE_URL') {
    return mockQueueUrl;
  }
  if (name === 'REPROCESS_AGE_MILLIS') {
    const ninetyDaysInMillis = 1000 * 60 * 60 * 24 * 90;
    return ninetyDaysInMillis.toFixed();
  }
  throw new Error(`Bad environment variable: "${name}"`);
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockNow = require('../../../backend/shared/time.lambda-shared')
  .now as jest.MockedFunction<typeof now>;
mockNow.mockImplementation(() =>
  new Date('2023-07-24T10:00:00.000Z').getTime()
);

test('basic case', () => {
  // GIVEN
  const s3Mock = mockClient(S3Client);
  const sqsMock = mockClient(SQSClient);
  const event = {
    Key: `${STORAGE_KEY_PREFIX}dummy${METADATA_KEY_SUFFIX}`,
  };
  const mockTime = '2023-06-24T10:00:00.000Z';
  const tarballKey = `${STORAGE_KEY_PREFIX}dummy${PACKAGE_KEY_SUFFIX}`;

  const context = {
    awsRequestId: 'dummy-request-id',
    logGroupName: 'log-group-name',
    logStreamName: 'log-stream-name',
  } as any;

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockBucketName,
      Key: event.Key,
    })
    .resolves({ Body: stringToStream(JSON.stringify({ date: mockTime })) });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockBucketName,
      Key: tarballKey,
    })
    .resolves({ Body: stringToStream('this-is-a-tarball-believe-me') });

  sqsMock.on(SendMessageCommand).callsFake((request) => {
    expect(request.QueueUrl).toBe(mockQueueUrl);
    expect(JSON.parse(request.MessageBody)).toEqual({
      integrity:
        'sha384-IOLCcAiKbgz1Uj1o3xp7apSzx1SbeNgBN67HA+Jhyb4ZDhNBeduhlGtDuRlo9UWU',
      reIngest: true,
      metadata: {
        reprocessLogGroup: context.logGroupName,
        reprocessLogStream: context.logStreamName,
        reprocessRequestId: context.awsRequestId,
      },
      tarballUri: `s3://${mockBucketName}/${STORAGE_KEY_PREFIX}dummy${PACKAGE_KEY_SUFFIX}`,
      time: mockTime,
    });
    return {};
  });

  // THEN
  return expect(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../backend/ingestion/re-ingest.lambda').handler(
      event,
      context
    )
  ).resolves.toEqual({});
});

test('too old to re-ingest', () => {
  // GIVEN
  const s3Mock = mockClient(S3Client);
  const event = {
    Key: `${STORAGE_KEY_PREFIX}dummy${METADATA_KEY_SUFFIX}`,
  };
  const mockTime = '2023-01-24T10:00:00.000Z';
  const tarballKey = `${STORAGE_KEY_PREFIX}dummy${PACKAGE_KEY_SUFFIX}`;

  const context = {
    awsRequestId: 'dummy-request-id',
    logGroupName: 'log-group-name',
    logStreamName: 'log-stream-name',
  } as any;

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockBucketName,
      Key: event.Key,
    })
    .resolves({ Body: stringToStream(JSON.stringify({ date: mockTime })) });

  s3Mock
    .on(GetObjectCommand, {
      Bucket: mockBucketName,
      Key: tarballKey,
    })
    .resolves({ Body: stringToStream('this-is-a-tarball-believe-me') });

  // THEN
  return expect(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../backend/ingestion/re-ingest.lambda').handler(
      event,
      context
    )
  ).resolves.toEqual(undefined);
});
