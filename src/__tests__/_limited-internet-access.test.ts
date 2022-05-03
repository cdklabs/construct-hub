import * as fs from 'fs';
import { Vpc } from '@aws-cdk/aws-ec2';
import { Stack, App } from '@aws-cdk/core';
import {
  parsePrefixList,
  createRestrictedSecurityGroups,
} from '../_limited-internet-access';
import '@aws-cdk/assert/jest';

describe(createRestrictedSecurityGroups, () => {
  test('creates the correct resources', () => {
    // GIVEN
    const app = new App();
    const stack = new Stack(app, 'TestStack');
    const vpc = new Vpc(stack, 'VPC');

    // WHEN
    createRestrictedSecurityGroups(stack, vpc);

    // THEN
    expect(app.synth().getStack(stack.stackName).template).toMatchSnapshot();
  });
});

const realReadFileSync = fs.readFileSync;
describe(parsePrefixList, () => {
  const mockReadFileSync = jest
    .fn()
    .mockName('fs.readFileSync') as jest.MockedFunction<typeof fs.readFileSync>;
  beforeEach(() => {
    (fs as any).readFileSync = mockReadFileSync;
  });
  afterEach(() => {
    (fs as any).readFileSync = realReadFileSync;
  });

  test('correctly parses list', () => {
    mockReadFileSync.mockReturnValueOnce(
      [
        '# This line is commented, the next one is blank',
        '',
        '1.2.3.4/5 # and a comment',
        '# 0.0.0.0/64',
        '198.41.128.0/17',
        '197.234.240.0/22',
      ].join('\n')
    );

    expect(parsePrefixList('/path/to/file')).toEqual([
      { cidr: '1.2.3.4/5' },
      { cidr: '197.234.240.0/22' },
      { cidr: '198.41.128.0/17' },
    ]);

    expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/file', 'utf8');
  });
});
