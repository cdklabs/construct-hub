import { GetObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../backend/orchestration/read-uninstallable-report.lambda';
import { S3_CLIENT } from '../../../backend/shared/aws.lambda-shared';

const s3Mock = mockClient(S3_CLIENT);

beforeEach(() => {
  s3Mock.reset();
});

test('reads and decompresses uninstallable packages report', async () => {
  const packages = ['package1@1.0.0', 'package2@2.0.0'];
  const mockBody = {
    transformToString: jest.fn().mockResolvedValue(JSON.stringify(packages)),
  };

  s3Mock.on(GetObjectCommand).resolves({
    Body: mockBody as any,
    ContentEncoding: undefined,
  });

  const result = await handler({
    bucket: 'test-bucket',
    key: 'uninstallable-objects/data.json',
  });

  expect(result).toEqual({ packages });
  expect(s3Mock.calls()).toHaveLength(1);
  expect(s3Mock.call(0).args[0].input).toEqual({
    Bucket: 'test-bucket',
    Key: 'uninstallable-objects/data.json',
  });
});

test('throws error when object not found', async () => {
  s3Mock.on(GetObjectCommand).resolves({
    Body: undefined,
  });

  await expect(
    handler({
      bucket: 'test-bucket',
      key: 'uninstallable-objects/data.json',
    })
  ).rejects.toThrow(
    'Object not found: s3://test-bucket/uninstallable-objects/data.json'
  );
});
