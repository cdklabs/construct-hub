import { Duration, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { CatalogBuilderMock } from './mocks/catalog-builder-mock';
import { DenyList, DenyListRule } from '../../../backend';
import { createDenyListMap } from '../../../backend/deny-list/create-map';
import { Monitoring } from '../../../monitoring';
import { OverviewDashboard } from '../../../overview-dashboard';

test('defaults - empty deny list', () => {
  const stack = new Stack();
  const denyList = new DenyList(stack, 'DenyList', {
    rules: [],
    monitoring: new Monitoring(stack, 'Monitoring'),
    packageDataBucket: new s3.Bucket(stack, 'PackageDataBucket'),
    packageDataKeyPrefix: 'my-data/',
    overviewDashboard: new OverviewDashboard(stack, 'OverviewDashboard'),
  });

  denyList.prune.onChangeInvoke(
    new CatalogBuilderMock(stack, 'CatalogBuilderMock')
  );

  // THEN
  expect(Template.fromStack(stack).toJSON()).toMatchSnapshot();
});

test('pruneOnChange is disabled', () => {
  const stack = new Stack();
  const denyList = new DenyList(stack, 'DenyList', {
    rules: [],
    monitoring: new Monitoring(stack, 'Monitoring'),
    packageDataBucket: new s3.Bucket(stack, 'PackageDataBucket'),
    packageDataKeyPrefix: 'my-data/',
    pruneOnChange: false,
    overviewDashboard: new OverviewDashboard(stack, 'OverviewDashboard'),
  });
  denyList.prune.onChangeInvoke(
    new CatalogBuilderMock(stack, 'CatalogBuilderMock')
  );

  // THEN
  Template.fromStack(stack).resourceCountIs('Custom::S3BucketNotifications', 0);
});

test('prunePeriod controls period', () => {
  const stack = new Stack();
  new DenyList(stack, 'DenyList', {
    rules: [],
    monitoring: new Monitoring(stack, 'Monitoring'),
    packageDataBucket: new s3.Bucket(stack, 'PackageDataBucket'),
    packageDataKeyPrefix: 'my-data/',
    prunePeriod: Duration.minutes(10),
    overviewDashboard: new OverviewDashboard(stack, 'OverviewDashboard'),
  });

  // THEN
  Template.fromStack(stack).hasResource('AWS::Events::Rule', {
    Properties: {
      ScheduleExpression: 'rate(10 minutes)',
    },
  });
});

test('prunePeriod of zero disables periodical pruning', () => {
  const stack = new Stack();
  new DenyList(stack, 'DenyList', {
    rules: [],
    monitoring: new Monitoring(stack, 'Monitoring'),
    packageDataBucket: new s3.Bucket(stack, 'PackageDataBucket'),
    packageDataKeyPrefix: 'my-data/',
    prunePeriod: Duration.minutes(0),
    overviewDashboard: new OverviewDashboard(stack, 'OverviewDashboard'),
  });

  // THEN
  Template.fromStack(stack).resourceCountIs('AWS::Events::Rule', 0);
});

describe('createDenyListMap()', () => {
  test('no rules', () => {
    const rules: DenyListRule[] = [];
    expect(createDenyListMap(rules)).toEqual({});
  });

  test('rule with "package"', () => {
    const rules: DenyListRule[] = [
      { packageName: 'my-package', reason: 'my reason' },
    ];
    expect(createDenyListMap(rules)).toEqual({
      'my-package': { packageName: 'my-package', reason: 'my reason' },
    });
  });

  test('rule with scoped "package"', () => {
    const rules: DenyListRule[] = [
      { packageName: '@my-scope/my-package', reason: 'my reason' },
    ];
    expect(createDenyListMap(rules)).toEqual({
      '@my-scope/my-package': {
        packageName: '@my-scope/my-package',
        reason: 'my reason',
      },
    });
  });

  test('rule with "package" and "version"', () => {
    const rules: DenyListRule[] = [
      {
        packageName: 'my-package',
        version: '1.2.3',
        reason: 'my reason 1.2.3',
      },
    ];
    expect(createDenyListMap(rules)).toEqual({
      'my-package/v1.2.3': {
        packageName: 'my-package',
        version: '1.2.3',
        reason: 'my reason 1.2.3',
      },
    });
  });

  test('fail for duplicate rules for the same package + version', () => {
    const rules: DenyListRule[] = [
      {
        packageName: 'my-package',
        version: '1.2.3',
        reason: 'my reason 1.2.3',
      },
      { packageName: 'my-package', version: '1.2.3', reason: 'your reason' },
    ];

    expect(() => createDenyListMap(rules)).toThrow(
      /Duplicate deny list entry: my-package\/v1\.2\.3/
    );
  });

  test('fails for duplicate rules for p+v,p (in that order)', () => {
    const rules: DenyListRule[] = [
      {
        packageName: 'my-package',
        version: '1.2.3',
        reason: 'only my-package@1.2.3 is blocked',
      },
      {
        packageName: 'my-package',
        version: '3.4.5',
        reason: 'only my-package@3.4.5 is blocked',
      },
      {
        packageName: 'my-package',
        reason: 'all versions of my-package are denied',
      },
    ];

    expect(() => createDenyListMap(rules)).toThrow(
      /Found rules that match specific versions of \"my-package\" \(1\.2\.3,3\.4\.5\) but there is also a rule that matches all versions/
    );
  });

  test('fails for duplicate rules for p,p+v,p+v (in that order)', () => {
    const rules: DenyListRule[] = [
      {
        packageName: 'my-package',
        reason: 'all versions of my-package are denied',
      },
      {
        packageName: 'my-package',
        version: '1.2.3',
        reason: 'only my-package@1.2.3 is blocked',
      },
      {
        packageName: 'my-package',
        version: '3.4.5',
        reason: 'only my-package@3.4.5 is blocked',
      },
    ];

    expect(() => createDenyListMap(rules)).toThrow(
      /Found rules that match specific versions of \"my-package\" \(1\.2\.3,3\.4\.5\) but there is also a rule that matches all versions/
    );
  });

  test('fails for duplicate rules for p+v,p,p+v (in that order)', () => {
    const rules: DenyListRule[] = [
      {
        packageName: 'my-package',
        version: '1.2.3',
        reason: 'only my-package@1.2.3 is blocked',
      },
      {
        packageName: 'my-package',
        reason: 'all versions of my-package are denied',
      },
      {
        packageName: 'my-package',
        version: '3.4.5',
        reason: 'only my-package@3.4.5 is blocked',
      },
    ];

    expect(() => createDenyListMap(rules)).toThrow(
      /Found rules that match specific versions of \"my-package\" \(1\.2\.3,3\.4\.5\) but there is also a rule that matches all versions/
    );
  });
});
