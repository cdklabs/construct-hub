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

/**
 * Determines the Construct framework used by the provided assembly.
 *
 * @param assembly the assembly for which a construct framework should be
 *                 identified.
 *
 * @returns a construct framework if one could be identified.
 */
export function detectConstructFramework(assembly: Assembly): ConstructFramework | undefined {
  let name: ConstructFramework['name'] | undefined;
  let nameAmbiguous = false;
  let majorVersion: number | undefined;
  let majorVersionAmbiguous = false;

  // exception: we assume all @cdktf/ libraries are cdktf, even if they
  // also take other CDK types as dependencies
  if (assembly.name.startsWith('@cdktf/')) {
    name = ConstructFrameworkName.CDKTF;
    if ('cdktf' in (assembly.dependencyClosure ?? {})) {
      detectConstructFrameworkPackage('cdktf');
    }
    return { name, majorVersion };
  }

  detectConstructFrameworkPackage(assembly.name, assembly.version);
  for (const depName of Object.keys(assembly.dependencyClosure ?? {})) {
    detectConstructFrameworkPackage(depName);
    if (nameAmbiguous) {
      return undefined;
    }
  }

  return name && { name, majorVersion: majorVersionAmbiguous ? undefined : majorVersion };

  function detectConstructFrameworkPackage(packageName: string, versionRange = assembly.dependencies?.[packageName]): void {
    if (packageName.startsWith('@aws-cdk/') || packageName === 'aws-cdk-lib' || packageName === 'monocdk') {
      if (name && name !== ConstructFrameworkName.AWS_CDK) {
        // Identified multiple candidates, so returning ambiguous...
        nameAmbiguous = true;
        return;
      }
      name = ConstructFrameworkName.AWS_CDK;
    } else if (packageName === 'cdktf') {
      if (name && name !== ConstructFrameworkName.CDKTF) {
        // Identified multiple candidates, so returning ambiguous...
        nameAmbiguous = true;
        return;
      }
      name = ConstructFrameworkName.CDKTF;
    } else if (packageName === 'cdk8s' || /^cdk8s-plus(?:-(?:17|20|21|22))?$/.test(packageName)) {
      if (name && name !== ConstructFrameworkName.CDK8S) {
        // Identified multiple candidates, so returning ambiguous...
        nameAmbiguous = true;
        return;
      }
      name = ConstructFrameworkName.CDK8S;
    } else {
      return;
    }
    if (versionRange) {
      const major = minVersion(versionRange)?.major;
      if (majorVersion != null && majorVersion !== major) {
        // Identified multiple candidates, so this is ambiguous...
        majorVersionAmbiguous = true;
      }
      majorVersion = major;
    }
    return;
  }
}
