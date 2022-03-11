import { Assembly } from '@jsii/spec';
import { minVersion } from 'semver';

export const enum ConstructFrameworkName {
  AWS_CDK = 'aws-cdk',
  CDK8S = 'cdk8s',
  CDKTF = 'cdktf',
}

export interface ConstructFramework {
  /**
   * The name of the construct framework.
   */
  readonly name: ConstructFrameworkName;

  /**
   * The major version of the construct framework that is used, if it could be
   * identified.
   */
  readonly majorVersion?: number;
}

const FRAMEWORK_TESTS: Record<ConstructFrameworkName, (name: string) => boolean> = {
  [ConstructFrameworkName.AWS_CDK]: (name: string) => name.startsWith('@aws-cdk/') || name === 'aws-cdk-lib' || name === 'monocdk',
  [ConstructFrameworkName.CDK8S]: (name: string) => name === 'cdk8s' || /^cdk8s-plus(?:-(?:17|20|21|22))?$/.test(name),
  [ConstructFrameworkName.CDKTF]: (name: string) => name === 'cdktf',
};

/**
 * Determines the Construct framework used by the provided assembly.
 *
 * @param assembly the assembly for which a construct framework should be
 *                 identified.
 *
 * @returns a construct framework if one could be identified.
 */
export function detectConstructFrameworks(assembly: Assembly): ConstructFramework[] {
  // number indicates we have seen that framework and there is a single major
  // version associated with it, while null indicates that multiple major
  // versions were seen so the framework version is ambiguous
  const detectedFrameworks: { [P in ConstructFrameworkName]?: number | null } = {};

  detectConstructFrameworkPackage(assembly.name, assembly.version);
  for (const depName of Object.keys(assembly.dependencyClosure ?? {})) {
    detectConstructFrameworkPackage(depName);
  }

  const frameworks: ConstructFramework[] = [];
  for (const [frameworkName, majorVersion] of Object.entries(detectedFrameworks)) {
    const name = frameworkName as ConstructFrameworkName;
    if (majorVersion === undefined) {
      continue;
    } else if (majorVersion === null) {
      frameworks.push({ name });
    } else if (typeof majorVersion === 'number') {
      frameworks.push({ name, majorVersion });
    }
  }

  return frameworks;

  /**
   * Analyses the package name and version range, and updates
   * `detectedFrameworks` from the parent scope appropriately
   */
  function detectConstructFrameworkPackage(packageName: string, versionRange = assembly.dependencies?.[packageName]): void {
    const packageMajor = versionRange ? minVersion(versionRange)?.major : undefined;

    for (const frameworkName of [ConstructFrameworkName.AWS_CDK, ConstructFrameworkName.CDK8S, ConstructFrameworkName.CDKTF]) {
      const matchesFramework = FRAMEWORK_TESTS[frameworkName];
      if (matchesFramework(packageName)) {
        const frameworkVersion: number | null | undefined = detectedFrameworks[frameworkName];
        if (frameworkVersion === undefined) {
          detectedFrameworks[frameworkName] = typeof packageMajor === 'number' ? packageMajor : null;
          return;
        } else if (frameworkVersion === null) {
        // already identified this framework as ambiguous, so we are done
          return;
        } else if (typeof packageMajor === 'number') {
          if (frameworkVersion !== packageMajor) {
            detectedFrameworks[frameworkName] = null;
          }
          return;
        }
      }
    }
  }
}
