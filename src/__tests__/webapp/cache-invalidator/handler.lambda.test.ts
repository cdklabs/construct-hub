import { pseudoRandomBytes } from 'crypto';
import { S3Event } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';

const mockDistributionId = pseudoRandomBytes(16).toString('hex');
const mockPathPrefix = pseudoRandomBytes(16).toString('base64');

beforeEach(() => {
  process.env.DISTRIBUTION_ID = mockDistributionId;
  process.env.PATH_PREFIX = mockPathPrefix;
  AWSMock.setSDKInstance(AWS);
});

afterEach(() => {
  delete process.env.DISTRIBUTION_ID;
  delete process.env.PATH_PREFIX;
  AWSMock.restore();
});

const mockEvent: S3Event = {
  Records: Array.from(
    { length: randomInt(2, 10) },
    (_, index) => ({
      eventVersion: '1337.42',
      eventSource: 's3.test',
      awsRegion: 'bermuda-triangle-1',
      eventTime: new Date().toISOString(),
      eventName: 'PutObject:Test',
      userIdentity: { principalId: 'arn::test::principal' },
      requestParameters: { sourceIPAddress: '127.0.0.1' },
      responseElements: { 'x-amz-request-id': pseudoRandomBytes(16).toString('hex'), 'x-amz-id-2': pseudoRandomBytes(16).toString('hex') },
      s3: {
        s3SchemaVersion: '1337',
        configurationId: '42',
        bucket: { arn: 'arn:aws:s3:::phony-bucket-name', name: 'phony-bucket-name', ownerIdentity: { principalId: 'arn::test::principal' } },
        object: {
          key: pseudoRandomBytes(16).toString('base64'),
          size: randomInt(0, 1_024),
          eTag: pseudoRandomBytes(16).toString('hex'),
          sequencer: `${index}-${pseudoRandomBytes(16).toString('hex')}`,
        },
      },
    }),
  ),
};


test('creates the expected invalidation', async () => {
  const mockInvalidationLocation = pseudoRandomBytes(16).toString('hex');

  AWSMock.mock('CloudFront', 'createInvalidation', (req: AWS.CloudFront.CreateInvalidationRequest, cb: Response<AWS.CloudFront.CreateInvalidationResult>) => {
    try {
      expect(req.DistributionId).toBe(mockDistributionId);
      expect(req.InvalidationBatch.Paths.Quantity).toBe(mockEvent.Records.length);
      expect(req.InvalidationBatch.Paths.Items).toEqual(mockEvent.Records.map((record) => `${mockPathPrefix}${record.s3.object.key}`));
      expect(req.InvalidationBatch.CallerReference).toBe(mockEvent.Records.map((record) => record.s3.object.eTag).join(', '));
    } catch (e) {
      return cb(e);
    }
    cb(null, { Location: mockInvalidationLocation });
  });

  // Requiring the handler her to ensure it sees the expected environment variables
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { handler } = require('../../../webapp/cache-invalidator/handler.lambda');
  return expect(handler(mockEvent, {} as any)).resolves.toEqual({ Location: mockInvalidationLocation });
});

type Response<T> = (err: Error | null, data?: T) => void;

function randomInt(min: number, max: number) {
  return min + Math.ceil(Math.random() * (max - min));
}
