import { Assembly } from '@jsii/spec';
import { ConstructFramework, ConstructFrameworkName, detectConstructFrameworks } from '../../../backend/ingestion/framework-detection.lambda-shared';

describe('AWS CDK frameworks', () => {
  expect(frameworkForDeps(['@aws-cdk/aws-s3@1.134.0']))
    .toEqual([{ name: ConstructFrameworkName.AWS_CDK, majorVersion: 1 }]);

  expect(frameworkForDeps(['@aws-cdk/aws-s3@1.134.0', '@aws-cdk/aws-lambda@1.134.0']))
    .toEqual([{ name: ConstructFrameworkName.AWS_CDK, majorVersion: 1 }]);

  expect(frameworkForDeps(['@aws-cdk/aws-s3@1.134.0', '@aws-cdk/aws-lambda@1.135.0']))
    .toEqual([{ name: ConstructFrameworkName.AWS_CDK, majorVersion: 1 }]);

  it('classifies no major version if versions are mixed', () => {
    expect(frameworkForDeps(['@aws-cdk/aws-s3@1.134.0', '@aws-cdk/aws-lambda@2.0.0']))
      .toEqual([{ name: ConstructFrameworkName.AWS_CDK, majorVersion: undefined }]);
  });

  it('classifies v1 libraries', () => {
    for (const name of ['monocdk', '@aws-cdk/core', '@aws-cdk/aws-s3']) {
      const assembly = { name, version: '1.134.0' };
      expect(detectConstructFrameworks(assembly as Assembly))
        .toEqual([{ name: ConstructFrameworkName.AWS_CDK, majorVersion: 1 }]);
    }
  });

  it('classifies v2 libraries', () => {
    expect(frameworkForDeps(['aws-cdk-lib@2.0.0']))
      .toEqual([{ name: ConstructFrameworkName.AWS_CDK, majorVersion: 2 }]);
  });
});

describe('cdk8s frameworks', () => {
  expect(frameworkForDeps(['cdk8s@1.1.0']))
    .toEqual([{ name: ConstructFrameworkName.CDK8S, majorVersion: 1 }]);

  expect(frameworkForDeps(['cdk8s@1.1.0', 'cdk8s-plus-22@1.0.0-beta.54']))
    .toEqual([{ name: ConstructFrameworkName.CDK8S, majorVersion: 1 }]);
});

describe('cdktf frameworks', () => {
  expect(frameworkForDeps(['cdktf@0.7.0']))
    .toEqual([{ name: ConstructFrameworkName.CDKTF, majorVersion: 0 }]);

  expect(frameworkForDeps(['cdktf@0.7.0', '@cdktf/provider-aws@0.1.0']))
    .toEqual([{ name: ConstructFrameworkName.CDKTF, majorVersion: 0 }]);

  it('ignores cdktf provider versions', () => {
    expect(frameworkForDeps(['cdktf@0.7.0', '@cdktf/provider-aws@2.0.0']))
      .toEqual([{ name: ConstructFrameworkName.CDKTF, majorVersion: 0 }]);
  });
});

it('classifies non-frameworks', () => {
  const assembly = { name: 'constructs', version: '10.0.0' };
  expect(detectConstructFrameworks(assembly as Assembly)).toEqual([]);
});

it('classifies mixed frameworks', () => {
  expect(frameworkForDeps(['@aws-cdk/aws-s3@1.134.0', 'cdk8s@1.1.0']))
    .toEqual([
      { name: ConstructFrameworkName.AWS_CDK, majorVersion: 1 },
      { name: ConstructFrameworkName.CDK8S, majorVersion: 1 },
    ]);

  expect(frameworkForDeps(['cdktf@0.7.0', 'aws-cdk-lib@2.0.0-rc.17']))
    .toEqual([
      { name: ConstructFrameworkName.CDKTF, majorVersion: 0 },
      { name: ConstructFrameworkName.AWS_CDK, majorVersion: 2 },
    ]);

  // wow all three!!
  expect(frameworkForDeps(['cdktf@0.7.0', 'aws-cdk-lib@2.0.0-rc.17', 'cdk8s@1.1.0']))
    .toEqual([
      { name: ConstructFrameworkName.CDKTF, majorVersion: 0 },
      { name: ConstructFrameworkName.AWS_CDK, majorVersion: 2 },
      { name: ConstructFrameworkName.CDK8S, majorVersion: 1 },
    ]);
});

function frameworkForDeps(deps: string[]): ConstructFramework[] {
  return detectConstructFrameworks(assemblyWithDeps({ deps }));
}

function assemblyWithDeps(options: { deps: string[]; name?: string }): Assembly {
  const { deps, name } = options;
  // Split on the @ that is not at the beginning of the string
  const depVersions: string[][] = deps.map((dep) => dep.split(/(?!^)@/));
  const assembly: Partial<Assembly> = {
    name: name ?? 'mylib',
    version: '1.2.3',
    dependencies: Object.fromEntries(depVersions),
    dependencyClosure: Object.fromEntries(depVersions.map(([depName, _]) => [depName, {}])),
  };
  return assembly as Assembly;
}
