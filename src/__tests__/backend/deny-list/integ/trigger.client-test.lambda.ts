import * as assert from 'assert';
import { DenyListRule } from '../../../..';
import { DenyListClient } from '../../../../backend/deny-list/client.lambda-shared';

const RULE1: DenyListRule = {
  packageName: 'mypackage',
  reason: '"mypackage" is deprecated',
};

const RULE2: DenyListRule = {
  packageName: 'your',
  version: '1.2.3',
  reason: 'v1.2.3 of "your" has a security issue',
};

export async function handler() {
  const client = await DenyListClient.newClient();

  assert.deepStrictEqual(client.map, {
    mypackage: RULE1,
    'your/v1.2.3': RULE2,
  });

  assert.deepStrictEqual(client.lookup('mypackage', '1.2.3'), RULE1);
  assert.deepStrictEqual(client.lookup('mypackage', '1.0.1'), RULE1);
  assert.deepStrictEqual(client.lookup('your', '1.0.0'), undefined);
  assert.deepStrictEqual(client.lookup('your', '1.2.3'), RULE2);
  assert.deepStrictEqual(client.lookup('boom', '1.2.3'), undefined);
}
