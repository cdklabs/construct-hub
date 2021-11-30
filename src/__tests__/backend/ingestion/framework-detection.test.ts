import { Assembly } from '@jsii/spec';
import { ConstructFramework, ConstructFrameworkName, detectConstructFramework } from '../../../backend/ingestion/framework-detection';

describe('AWS CDK frameworks', () => {
  expect(frameworkForDeps(['@aws-cdk/aws-s3@1.134.0'])).toEqual({ name: ConstructFrameworkName.AWS_CDK, majorVersion: 1 });
  expect(frameworkForDeps(['@aws-cdk/aws-s3@1.134.0', '@aws-cdk/aws-lambda@1.134.0'])).toEqual({ name: ConstructFrameworkName.AWS_CDK, majorVersion: 1 });
  expect(frameworkForDeps(['@aws-cdk/aws-s3@1.134.0', '@aws-cdk/aws-lambda@1.135.0'])).toEqual({ name: ConstructFrameworkName.AWS_CDK, majorVersion: 1 });

  it('classifies no major version if versions are mixed', () => {
    expect(frameworkForDeps(['@aws-cdk/aws-s3@1.134.0', '@aws-cdk/aws-lambda@2.0.0'])).toEqual({ name: ConstructFrameworkName.AWS_CDK, majorVersion: undefined });
  });

  it('classifies core libraries', () => {
    for (const name of ['monocdk', 'aws-cdk-lib', '@aws-cdk/aws-s3']) {
      const assembly = { name, version: '1.134.0' };
      expect(detectConstructFramework(assembly as Assembly)).toEqual({ name: ConstructFrameworkName.AWS_CDK, majorVersion: 1 });
    }
  });
});

describe('CDK8s frameworks', () => {
  expect(frameworkForDeps(['cdk8s@1.1.0'])).toEqual({ name: ConstructFrameworkName.CDK8S, majorVersion: 1 });
  expect(frameworkForDeps(['cdk8s@1.1.0', 'cdk8s-plus-22@1.0.0-beta.54'])).toEqual({ name: ConstructFrameworkName.CDK8S, majorVersion: 1 });
});

describe('cdktf frameworks', () => {
  expect(frameworkForDeps(['cdktf@0.7.0'])).toEqual({ name: ConstructFrameworkName.CDKTF, majorVersion: 0 });
  expect(frameworkForDeps(['cdktf@0.7.0', '@cdktf/provider-aws@0.1.0'])).toEqual({ name: ConstructFrameworkName.CDKTF, majorVersion: 0 });

  it('ignores cdktf provider versions', () => {
    expect(frameworkForDeps(['cdktf@0.7.0', '@cdktf/provider-aws@2.0.0'])).toEqual({ name: ConstructFrameworkName.CDKTF, majorVersion: 0 });
  });

  it('classifies cdktf', () => {
    const assembly = { name: 'cdktf', version: '0.7.0' };
    expect(detectConstructFramework(assembly as Assembly)).toEqual({ name: ConstructFrameworkName.CDKTF, majorVersion: 0 });
  });

  it('never classifies @cdktf/ as ambiguous', () => {
    const mixedAssembly = assemblyWithDeps(['cdktf@0.7.0', 'aws-cdk-lib@2.0.0-rc.17'], '@cdktf/aws-cdk');
    expect(detectConstructFramework(mixedAssembly)).toEqual({ name: ConstructFrameworkName.CDKTF, majorVersion: 0 });
  });
});

it('classifies non-frameworks', () => {
  const assembly = { name: 'constructs', version: '10.0.0' };
  expect(detectConstructFramework(assembly as Assembly)).toEqual(undefined);
});

it('classifies mixed frameworks', () => {
  expect(frameworkForDeps(['@aws-cdk/aws-s3@1.134.0', 'cdk8s@1.1.0'])).toEqual(undefined);
});

function frameworkForDeps(deps: string[]): ConstructFramework | undefined {
  return detectConstructFramework(assemblyWithDeps(deps));
}

function assemblyWithDeps(deps: string[], name?: string): Assembly {
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
