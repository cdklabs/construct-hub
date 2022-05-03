import { Code, Function, Runtime } from '@aws-cdk/aws-lambda';
import { App, Stack } from '@aws-cdk/core';
import { LicenseList } from '../../../backend/license-list/license-list';
import { SpdxLicense } from '../../../spdx-license';

test('empty set', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const lambda = new Function(stack, 'Function', {
    code: Code.fromInline('/* ... */'),
    runtime: Runtime.NODEJS_12_X,
    handler: 'index.handler',
  });

  // WHEN
  new LicenseList(stack, 'LicenseList', { licenses: [] }).grantRead(lambda);

  // THEN
  expect(
    app.synth().getStackByName(stack.stackName).template
  ).toMatchSnapshot();
});

test('Apache licenses only', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const lambda = new Function(stack, 'Function', {
    code: Code.fromInline('/* ... */'),
    runtime: Runtime.NODEJS_12_X,
    handler: 'index.handler',
  });

  // WHEN
  new LicenseList(stack, 'LicenseList', {
    licenses: SpdxLicense.apache(),
  }).grantRead(lambda);

  // THEN
  expect(
    app.synth().getStackByName(stack.stackName).template
  ).toMatchSnapshot();
});

test('BSD licenses only', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const lambda = new Function(stack, 'Function', {
    code: Code.fromInline('/* ... */'),
    runtime: Runtime.NODEJS_12_X,
    handler: 'index.handler',
  });

  // WHEN
  new LicenseList(stack, 'LicenseList', {
    licenses: SpdxLicense.bsd(),
  }).grantRead(lambda);

  // THEN
  expect(
    app.synth().getStackByName(stack.stackName).template
  ).toMatchSnapshot();
});

test('MIT licenses only', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const lambda = new Function(stack, 'Function', {
    code: Code.fromInline('/* ... */'),
    runtime: Runtime.NODEJS_12_X,
    handler: 'index.handler',
  });

  // WHEN
  new LicenseList(stack, 'LicenseList', {
    licenses: SpdxLicense.mit(),
  }).grantRead(lambda);

  // THEN
  expect(
    app.synth().getStackByName(stack.stackName).template
  ).toMatchSnapshot();
});

test('OSI-Approved licenses only', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const lambda = new Function(stack, 'Function', {
    code: Code.fromInline('/* ... */'),
    runtime: Runtime.NODEJS_12_X,
    handler: 'index.handler',
  });

  // WHEN
  new LicenseList(stack, 'LicenseList', {
    licenses: SpdxLicense.osiApproved(),
  }).grantRead(lambda);

  // THEN
  expect(
    app.synth().getStackByName(stack.stackName).template
  ).toMatchSnapshot();
});

test('All licenses', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const lambda = new Function(stack, 'Function', {
    code: Code.fromInline('/* ... */'),
    runtime: Runtime.NODEJS_12_X,
    handler: 'index.handler',
  });

  // WHEN
  new LicenseList(stack, 'LicenseList', {
    licenses: SpdxLicense.all(),
  }).grantRead(lambda);

  // THEN
  expect(
    app.synth().getStackByName(stack.stackName).template
  ).toMatchSnapshot();
});
