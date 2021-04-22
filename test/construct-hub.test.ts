import '@aws-cdk/assert/jest';

import { PublicHostedZone } from '@aws-cdk/aws-route53';
import { App, Stack } from '@aws-cdk/core';
import { CloudFormationStackArtifact } from '@aws-cdk/cx-api';
import { stringify as yaml } from 'yaml';

import { ConstructHub } from '../src/construct-hub';

expect.addSnapshotSerializer({
  test: (val) => val instanceof CloudFormationStackArtifact,
  serialize: (val: CloudFormationStackArtifact) => yaml(val.template),
});

test('minimal configuration', () => {
  // Given
  const app = new App();
  const stack = new Stack(app, 'Stack');
  const hostedZone = new PublicHostedZone(stack, 'HostedZone', { zoneName: 'hub.constructs.test' });

  // When
  new ConstructHub(stack, 'ConstructHub', { hostedZone });

  // Then
  expect(() => app.synth()).not.toThrow();
  expect(app.synth().getStackByName(stack.stackName)).toMatchSnapshot();
});
