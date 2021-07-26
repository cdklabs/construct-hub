import '@aws-cdk/assert/jest';

import { App } from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import { stringify as yaml } from 'yaml';

import { DevStack } from './dev-stack';

expect.addSnapshotSerializer({
  test: (val) => val instanceof cxapi.CloudFormationStackArtifact,
  serialize: (val: cxapi.CloudFormationStackArtifact) => yaml(val.template),
});

test('golden snapshot', () => {
  const app = new App();
  const stack = new DevStack(app, 'dev', { isolateLambdas: true });
  expect(app.synth().getStackByName(stack.stackName)).toMatchSnapshot();
});
