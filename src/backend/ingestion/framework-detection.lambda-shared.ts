// eslint-disable-next-line @typescript-eslint/no-require-imports
import assert = require('assert');

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
 * Predicates that determine whether a package is indicative of the CDK
 * framework someone is using.
 */
const FRAMEWORK_MATCHERS: Record<
  ConstructFrameworkName,
  (name: string) => boolean
> = {
  [ConstructFrameworkName.AWS_CDK]: (name: string) =>
    name.startsWith('@aws-cdk/') ||
    name === 'aws-cdk-lib' ||
    name === 'monocdk',
  [ConstructFrameworkName.CDK8S]: (name: string) =>
    name === 'cdk8s' || /^cdk8s-plus(?:-(?:17|20|21|22))?$/.test(name),
  // cdktf providers dependencies ("@cdktf/provider-xxx") are major versioned
  // differently than the core library, so do not take them into account
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
export function detectConstructFrameworks(
  assembly: Assembly
): ConstructFramework[] {
  // "not-sure" means we haven't seen a major version for the framework yet,
  // e.g. in the case of a transitive dependency where the info isn't provided
  // "ambiguous" means we have seen multiple major versions so it's impossible
  // to resolve a single number
  const detectedFrameworks: {
    [P in ConstructFrameworkName]?: number | 'no-data' | 'ambiguous';
  } = {};

  detectConstructFrameworkPackage(assembly.name, assembly.version);
  for (const depName of Object.keys(assembly.dependencyClosure ?? {})) {
    detectConstructFrameworkPackage(depName);
  }

  const frameworks = new Array<ConstructFramework>();
  for (const [frameworkName, majorVersion] of Object.entries(
    detectedFrameworks
  )) {
    const name = frameworkName as ConstructFrameworkName;
    if (majorVersion === undefined) {
      continue;
    } else if (majorVersion === 'ambiguous' || majorVersion === 'no-data') {
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
  function detectConstructFrameworkPackage(
    packageName: string,
    versionRange = assembly.dependencies?.[packageName]
  ): void {
    for (const frameworkName of [
      ConstructFrameworkName.AWS_CDK,
      ConstructFrameworkName.CDK8S,
      ConstructFrameworkName.CDKTF,
    ]) {
      const matchesFramework = FRAMEWORK_MATCHERS[frameworkName];
      if (matchesFramework(packageName)) {
        const frameworkVersion = detectedFrameworks[frameworkName];
        if (frameworkVersion === 'ambiguous') {
          // We have already seen multiple major versions and have determined
          // the major version is ambiguous, so this package won't give
          // us any new information.
          return;
        }

        const packageMajor =
          (versionRange ? minVersion(versionRange)?.major : undefined) ??
          'no-data';

        if (frameworkVersion === undefined) {
          // It's the first time seeing this major version, so we record
          // whatever new information we found ("no-data" or number).
          detectedFrameworks[frameworkName] = packageMajor;
          return;
        } else if (frameworkVersion === 'no-data') {
          // We've seen this framework before but haven't seen a major version,
          // so record whatever new information we found ("no-data" or number).
          detectedFrameworks[frameworkName] = packageMajor;
          return;
        } else {
          // At this point, frameworkVersion can only be a MV number
          assert(typeof frameworkVersion === 'number');

          // We've seen evidence of a particular major version for this
          // framework, so only update if this package conflicts with what
          // we're expecting.
          if (packageMajor !== 'no-data' && frameworkVersion !== packageMajor) {
            detectedFrameworks[frameworkName] = 'ambiguous';
          }
          return;
        }
      }
    }
  }
}
