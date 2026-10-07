import {
  BatchWriteItemCommand,
  DynamoDB,
  DynamoDBClient,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { KnownVersions } from '../../../package-sources/npmjs/known-versions.lambda-shared';

const TABLE = 'known-versions-table';
const mockDynamoDB = mockClient(DynamoDBClient);

function newKnownVersions() {
  return new KnownVersions(TABLE, new DynamoDB({}));
}

/** The `name@version` keys written by `BatchWriteItem`, sorted. */
function writtenKeys(): string[] {
  return mockDynamoDB
    .commandCalls(BatchWriteItemCommand)
    .flatMap((call) => call.args[0].input.RequestItems![TABLE])
    .map(
      (request) =>
        `${request.PutRequest!.Item!.name.S}@${
          request.PutRequest!.Item!.version.S
        }`
    )
    .sort();
}

beforeEach(() => {
  mockDynamoDB.reset();
  mockDynamoDB.on(QueryCommand).resolves({ Items: [] });
  mockDynamoDB.on(BatchWriteItemCommand).resolves({ UnprocessedItems: {} });
});

describe('has', () => {
  test('returns whether a version is recorded for the package', async () => {
    mockDynamoDB.on(QueryCommand).resolves({
      Items: [{ version: { S: '1.0.0' } }, { version: { S: '1.1.0' } }],
    });
    const known = newKnownVersions();

    expect(await known.has('some-package', '1.0.0')).toBe(true);
    expect(await known.has('some-package', '1.1.0')).toBe(true);
    expect(await known.has('some-package', '2.0.0')).toBe(false);
    expect(mockDynamoDB).toHaveReceivedCommandWith(QueryCommand, {
      TableName: TABLE,
      ConsistentRead: true,
      ExpressionAttributeValues: { ':name': { S: 'some-package' } },
    });
  });

  test('follows query pagination', async () => {
    mockDynamoDB
      .on(QueryCommand)
      .resolvesOnce({
        Items: [{ version: { S: '1.0.0' } }],
        LastEvaluatedKey: {
          name: { S: 'big-package' },
          version: { S: '1.0.0' },
        },
      })
      .resolvesOnce({ Items: [{ version: { S: '2.0.0' } }] });
    const known = newKnownVersions();

    expect(await known.has('big-package', '1.0.0')).toBe(true);
    expect(await known.has('big-package', '2.0.0')).toBe(true);
    expect(mockDynamoDB).toHaveReceivedCommandTimes(QueryCommand, 2);
  });

  test('queries each package only once, also for concurrent callers', async () => {
    const known = newKnownVersions();

    await Promise.all([
      known.has('some-package', '1.0.0'),
      known.has('some-package', '2.0.0'),
    ]);
    await known.has('some-package', '3.0.0');

    expect(mockDynamoDB).toHaveReceivedCommandTimes(QueryCommand, 1);
  });

  test('queries again after a failed query', async () => {
    mockDynamoDB
      .on(QueryCommand)
      .rejectsOnce(new Error('network'))
      .resolves({ Items: [{ version: { S: '1.0.0' } }] });
    const known = newKnownVersions();

    await expect(known.has('some-package', '1.0.0')).rejects.toThrow(/network/);
    expect(await known.has('some-package', '1.0.0')).toBe(true);
  });

  test('sees versions added locally right away, without a query', async () => {
    const known = newKnownVersions();

    known.add('@scope/package', '1.0.0');

    expect(await known.has('@scope/package', '1.0.0')).toBe(true);
    expect(mockDynamoDB).not.toHaveReceivedCommand(QueryCommand);
  });
});

describe('add and flush', () => {
  test('flush persists the added versions', async () => {
    const known = newKnownVersions();

    known.add('@scope/package', '1.0.0');
    known.add('other-package', '2.0.0');
    known.add('other-package', '2.0.0');
    expect(mockDynamoDB).not.toHaveReceivedCommand(BatchWriteItemCommand);
    expect(known.pendingCount).toBe(2);

    await known.flush();

    expect(known.pendingCount).toBe(0);
    expect(writtenKeys()).toEqual([
      '@scope/package@1.0.0',
      'other-package@2.0.0',
    ]);
  });

  test('keeps the records of a failed flush for the next attempt', async () => {
    mockDynamoDB
      .on(BatchWriteItemCommand)
      .rejectsOnce(new Error('network'))
      .resolves({ UnprocessedItems: {} });
    const known = newKnownVersions();
    known.add('some-package', '1.0.0');

    await expect(known.flush()).rejects.toThrow(/network/);
    expect(known.pendingCount).toBe(1);

    await known.flush();
    expect(known.pendingCount).toBe(0);
  });
});

describe('flush batching', () => {
  test('writes the records in batches of 25', async () => {
    const known = newKnownVersions();
    for (let i = 0; i < 60; i++) {
      known.add(`package-${i}`, `1.0.${i}`);
    }
    known.add('@scope/package', '2.0.0');

    await known.flush();

    expect(mockDynamoDB).toHaveReceivedCommandTimes(BatchWriteItemCommand, 3);
    expect(writtenKeys()).toHaveLength(61);
    expect(writtenKeys()).toContain('@scope/package@2.0.0');
  });

  test('retries unprocessed items', async () => {
    const unprocessed = {
      PutRequest: {
        Item: { name: { S: 'some-package' }, version: { S: '1.0.0' } },
      },
    };
    mockDynamoDB
      .on(BatchWriteItemCommand)
      .resolvesOnce({ UnprocessedItems: { [TABLE]: [unprocessed] } })
      .resolves({ UnprocessedItems: {} });
    const known = newKnownVersions();
    known.add('some-package', '1.0.0');

    await known.flush();

    const calls = mockDynamoDB.commandCalls(BatchWriteItemCommand);
    expect(calls).toHaveLength(2);
    expect(calls[1].args[0].input.RequestItems![TABLE]).toEqual([unprocessed]);
  });
});
