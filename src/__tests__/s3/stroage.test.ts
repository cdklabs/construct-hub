import '@aws-cdk/assert/jest';
import { Stack } from '@aws-cdk/core';
import { S3StorageFactory } from '../..';

test('is a stack singleton', () => {
  const stack = new Stack();

  const factory1 = S3StorageFactory.getOrCreate(stack);
  const factory2 = S3StorageFactory.getOrCreate(stack);

  expect(factory1).toBe(factory2);
});

test('creates a failover bucket as well', () => {
  const stack = new Stack();

  const factory = S3StorageFactory.getOrCreate(stack);
  factory.newBucket(stack, 'Bucket');

  expect(stack).toHaveResource('AWS::S3::Bucket', {
    Tags: [
      {
        Key: 'failover',
        Value: 'true',
      },
    ],
  });
});

test('provides the primary bucket by default', () => {
  const stack = new Stack();

  const factory = S3StorageFactory.getOrCreate(stack);
  const bucket = factory.newBucket(stack, 'Bucket');

  expect(bucket.node.id).toEqual('Bucket');
});

test('provides the failover bucket when requested', () => {
  const stack = new Stack();

  const factory = S3StorageFactory.getOrCreate(stack, { failover: true });
  const bucket = factory.newBucket(stack, 'Bucket');

  expect(bucket.node.id).toEqual('FailoverBucket');
});
