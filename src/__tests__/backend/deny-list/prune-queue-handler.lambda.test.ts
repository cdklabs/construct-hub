import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SQSRecord } from 'aws-lambda';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import { ENV_DELETE_OBJECT_DATA_BUCKET_NAME } from '../../../backend/deny-list/constants';
import { handler } from '../../../backend/deny-list/prune-queue-handler.lambda';

beforeEach(() => {
  process.env[ENV_DELETE_OBJECT_DATA_BUCKET_NAME] = 'data-bucket-name';
});

afterEach(() => {
  delete process.env[ENV_DELETE_OBJECT_DATA_BUCKET_NAME];
});

test('Deletes all records', async () => {
  const s3Mock: AwsClientStub<S3Client> = mockClient(S3Client);

  // WHEN
  await handler({
    Records: [makeRecord('file1'), makeRecord('file2')],
  });

  // THEN
  const deleteCalls = s3Mock.commandCalls(DeleteObjectCommand);
  expect(deleteCalls).toHaveLength(2);
  expect(deleteCalls[0].args[0].input).toEqual({
    Bucket: 'data-bucket-name',
    Key: 'file1',
  });
  expect(deleteCalls[1].args[0].input).toEqual({
    Bucket: 'data-bucket-name',
    Key: 'file2',
  });
});

test('Skip deletion if event has no records', async () => {
  const s3Mock: AwsClientStub<S3Client> = mockClient(S3Client);

  // WHEN
  await handler({
    Records: [],
  });

  // THEN
  const deleteCalls = s3Mock.commandCalls(DeleteObjectCommand);
  expect(deleteCalls).toHaveLength(0);
});

function makeRecord(body: string): SQSRecord {
  return {
    // this is the only attribute that matters for these tests
    body,

    // other attributes are not used
    messageId: 'message-id',
    receiptHandle: 'receipt-handle',
    attributes: {
      ApproximateFirstReceiveTimestamp: '0',
      ApproximateReceiveCount: '0',
      SenderId: 'sender-id',
      SentTimestamp: '0',
    },
    messageAttributes: {},
    md5OfBody: 'md5-of-body',
    awsRegion: 'eu-west-1',
    eventSource: '',
    eventSourceARN: '',
  };
}
