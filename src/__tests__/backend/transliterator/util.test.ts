import { canInstallDependencies } from '../../../backend/transliterator/transliterator.ecstask';

describe('canInstallDependencies', () => {
  it('allows semver and tag values', () => {
    const packageJson = {
      dependencies: {
        foo: '1.0.0 - 2.9999.9999',
        bar: '>=1.0.2 <2.1.2',
        baz: '>1.0.2 <=2.3.4',
        boo: '2.0.1',
        qux: '<1.0.0 || >=2.3.1 <2.4.5 || >=2.5.2 <3.0.0',
        til: '~1.2',
        elf: '~1.2.3',
        two: '2.x',
        thr: '3.3.x',
        lat: 'latest',
      },
    };

    expect(canInstallDependencies(packageJson)).toEqual(true);
  });

  it('does not allow urls', () => {
    expect(canInstallVersion('http://asdf.com/asdf.tar.gz')).toEqual(false);
  });

  it('does not allow github urls', () => {
    expect(canInstallVersion('expressjs/express')).toEqual(false);
    expect(canInstallVersion('mochajs/mocha#4727d357ea')).toEqual(false);
    expect(canInstallVersion('user/repo#feature\/branch')).toEqual(false);
  });

  it('does not allow git urls', () => {
    expect(canInstallVersion('git+ssh://git@github.com:npm/cli.git#v1.0.27')).toEqual(false);
    expect(canInstallVersion('git+ssh://git@github.com:npm/cli#semver:^5.0')).toEqual(false);
    expect(canInstallVersion('git+https://isaacs@github.com/npm/cli.git')).toEqual(false);
    expect(canInstallVersion('git://github.com/npm/cli.git#v1.0.27')).toEqual(false);
  });
});

const canInstallVersion = (version: string) => canInstallDependencies({ dependencies: { foo: version } });
