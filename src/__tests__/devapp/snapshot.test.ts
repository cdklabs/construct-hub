import '@aws-cdk/assert/jest';

import { App } from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import { stringify as yaml } from 'yaml';

import { Isolation } from '../../construct-hub';
import { DevStack } from './dev-stack';

expect.addSnapshotSerializer({
  test: (val) => val instanceof cxapi.CloudFormationStackArtifact,
  serialize: (val: cxapi.CloudFormationStackArtifact) => yaml(val.template),
});

test('golden snapshot', () => {
  const app = new App();
  process.env.GITHUB_TOKEN =
    'arn:aws:secretsmanager:us-east-2:111111111:secret:some-secret-1aa11a';
  const stack = new DevStack(app, 'dev', {
    sensitiveTaskIsolation: Isolation.NO_INTERNET_ACCESS,
  });
  expect(app.synth().getStackByName(stack.stackName)).toMatchSnapshot();
});
