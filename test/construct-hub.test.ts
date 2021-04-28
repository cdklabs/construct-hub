import '@aws-cdk/assert/jest';

import { App, Stack, aws_route53, cx_api } from 'aws-cdk-lib';
import { stringify as yaml } from 'yaml';

import { ConstructHub } from '../src/construct-hub';

expect.addSnapshotSerializer({
  test: (val) => val instanceof cx_api.CloudFormationStackArtifact,
  serialize: (val: cx_api.CloudFormationStackArtifact) => yaml(val.template),
});

test('minimal configuration', () => {
  // Given
  const app = new App();
  const stack = new Stack(app, 'Stack');
  const hostedZone = new aws_route53.PublicHostedZone(stack, 'HostedZone', { zoneName: 'hub.constructs.test' });

  // When
  new ConstructHub(stack, 'ConstructHub', { hostedZone });

  // Then
  expect(() => app.synth()).not.toThrow();
  expect(app.synth().getStackByName(stack.stackName)).toMatchSnapshot();
});
