import {
  InvokeCommand,
  InvokeCommandInput,
  LambdaClient,
} from '@aws-sdk/client-lambda';
import { _Object, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import {
  SendMessageCommand,
  SendMessageCommandInput,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import { DenyListMap } from '../../../backend';
import { DenyListClient } from '../../../backend/deny-list/client.lambda-shared';
import {
  ENV_PRUNE_ON_CHANGE_FUNCTION_NAME,
  ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME,
  ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX,
  ENV_PRUNE_QUEUE_URL,
} from '../../../backend/deny-list/constants';

import { handler } from '../../../backend/deny-list/prune-handler.lambda';

jest.mock('../../../backend/deny-list/client.lambda-shared');

beforeEach(() => {
  process.env[ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME] = 'prune-bucket-name';
  process.env[ENV_PRUNE_QUEUE_URL] = 'prune-queue-url';
  process.env[ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX] = 'data/';
  process.env[ENV_PRUNE_ON_CHANGE_FUNCTION_NAME] = 'prune-function-name';
});

afterEach(() => {
  delete process.env[ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME];
  delete process.env[ENV_PRUNE_QUEUE_URL];
  delete process.env[ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX];
  delete process.env[ENV_PRUNE_ON_CHANGE_FUNCTION_NAME];
});

test('Prune found packages', async () => {
  // GIVEN
  const s3Mock: AwsClientStub<S3Client> = mockClient(S3Client);
  const lambdaMock = mockClient(LambdaClient);
  const sqsMock = mockClient(SQSClient);

  givenDenyList({
    'aws-cdk-microservice': {
      packageName: 'aws-cdk-microservice',
      reason: 'Package is no longer available on NPM.',
    },
    'cdk-pipeline-status': {
      packageName: 'cdk-pipeline-status',
      reason: 'Package is no longer available on NPM.',
    },
  });

  givenS3State(s3Mock, [
    {
      Bucket: 'prune-bucket-name',
      Prefix: 'data/aws-cdk-microservice/',
      Contents: [
        {
          Key: 'file1',
        },
        {
          Key: 'file2',
        },
      ],
    },
    {
      Bucket: 'prune-bucket-name',
      Prefix: 'data/cdk-pipeline-status/',
      Contents: [
        {
          Key: 'file3',
        },
      ],
    },
  ]);

  // WHEN
  await handler({});

  // THEN
  expectSendMessageCalls(sqsMock, [
    {
      QueueUrl: 'prune-queue-url',
      MessageBody: 'file1',
    },
    {
      QueueUrl: 'prune-queue-url',
      MessageBody: 'file2',
    },
    {
      QueueUrl: 'prune-queue-url',
      MessageBody: 'file3',
    },
  ]);

  expectInvokeCalls(lambdaMock, [
    {
      FunctionName: 'prune-function-name',
      InvocationType: 'Event',
    },
  ]);
});

test('Do not change any state when no objects are found', async () => {
  // GIVEN
  const s3Mock: AwsClientStub<S3Client> = mockClient(S3Client);
  const lambdaMock = mockClient(LambdaClient);
  const sqsMock = mockClient(SQSClient);

  givenDenyList({
    'aws-cdk-microservice': {
      packageName: 'aws-cdk-microservice',
      reason: 'Package is no longer available on NPM.',
    },
    'cdk-pipeline-status': {
      packageName: 'cdk-pipeline-status',
      reason: 'Package is no longer available on NPM.',
    },
  });

  givenS3State(s3Mock, [
    {
      Bucket: 'prune-bucket-name',
      Prefix: 'data/aws-cdk-microservice/',
      Contents: [],
    },
    {
      Bucket: 'prune-bucket-name',
      Prefix: 'data/cdk-pipeline-status/',
      Contents: [],
    },
  ]);

  // WHEN
  await handler({});

  // THEN
  expectSendMessageCalls(sqsMock, []);
  expectInvokeCalls(lambdaMock, []);
});

test('Do not change any state when objects have no key', async () => {
  // GIVEN
  const s3Mock: AwsClientStub<S3Client> = mockClient(S3Client);
  const lambdaMock = mockClient(LambdaClient);
  const sqsMock = mockClient(SQSClient);

  givenDenyList({
    'aws-cdk-microservice': {
      packageName: 'aws-cdk-microservice',
      reason: 'Package is no longer available on NPM.',
    },
    'cdk-pipeline-status': {
      packageName: 'cdk-pipeline-status',
      reason: 'Package is no longer available on NPM.',
    },
  });

  givenS3State(s3Mock, [
    {
      Bucket: 'prune-bucket-name',
      Prefix: 'data/aws-cdk-microservice/',
      Contents: [{}, { ETag: 'etag' }],
    },
    {
      Bucket: 'prune-bucket-name',
      Prefix: 'data/cdk-pipeline-status/',
      Contents: [{ Size: 123 }, {}, { StorageClass: 'STANDARD' }],
    },
  ]);

  // WHEN
  await handler({});

  // THEN
  expectSendMessageCalls(sqsMock, []);
  expectInvokeCalls(lambdaMock, []);
});

interface FakeObject {
  Bucket: string;
  Prefix: string;
  Contents: _Object[];
}

function givenDenyList(denyList: DenyListMap) {
  DenyListClient.newClient = jest.fn().mockResolvedValue({
    get map(): DenyListMap {
      return denyList;
    },
  });
}

function givenS3State(s3Mock: AwsClientStub<S3Client>, contents: FakeObject[]) {
  for (const object of contents) {
    s3Mock
      .on(ListObjectsV2Command, {
        Bucket: object.Bucket,
        Prefix: object.Prefix,
        ContinuationToken: undefined,
      })
      .resolvesOnce({
        NextContinuationToken: undefined,
        Contents: object.Contents,
      });
  }
}

function expectSendMessageCalls(
  sqsMock: AwsClientStub<SQSClient>,
  inputs: SendMessageCommandInput[]
) {
  const sendMessageCalls = sqsMock.commandCalls(SendMessageCommand);
  expect(sendMessageCalls.length).toBe(inputs.length);

  for (let i = 0; i < inputs.length; i++) {
    let input = inputs[i];
    expect(sendMessageCalls[i].args[0].input).toStrictEqual({
      QueueUrl: input.QueueUrl,
      MessageBody: input.MessageBody,
    });
  }
}

function expectInvokeCalls(
  lambdaMock: AwsClientStub<LambdaClient>,
  inputs: InvokeCommandInput[]
) {
  const invokeCommandCalls = lambdaMock.commandCalls(InvokeCommand);
  expect(invokeCommandCalls.length).toBe(inputs.length);

  for (let i = 0; i < inputs.length; i++) {
    let input = inputs[i];
    expect(invokeCommandCalls[i].args[0].input).toStrictEqual({
      FunctionName: input.FunctionName,
      InvocationType: input.InvocationType,
    });
  }
}
