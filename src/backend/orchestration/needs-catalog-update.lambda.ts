import { compare, major } from 'semver';
import { CatalogClient } from '../catalog-builder/client.lambda-shared';
import type { StateMachineInput } from '../payload-schema';
import { STORAGE_KEY_FORMAT_REGEX } from '../shared/constants';

export type Input = Pick<StateMachineInput, 'package'>;

/**
 * This function checks whether the catalog object needs updating following the
 * ingestion of the provided package object. This is the case if the package is
 * representative of a new major version line, or if the package is newer than,
 * or at the same version than the one already in catalog for the same major
 * version line.
 *
 * This is used to reduce how many calls are made into the catalog builder
 * function, as that function runs with singleton concurrency. This ultimately
 * allows workflows to complete faster when they are targetting older versions
 * of packages.
 */
export async function handler(event: Input): Promise<boolean> {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  const [, packageName, version] = STORAGE_KEY_FORMAT_REGEX.exec(event.package.key) ?? die(`Unecpedted/invalid package key: ${event.package.key}`);
  const packageMajor = major(version);

  const catalogClient = await CatalogClient.newClient();
  const existingEntry = catalogClient.packages.find((pkg) => pkg.name === packageName && pkg.major === packageMajor);
  if (existingEntry == null) {
    return true;
  }

  return compare(version, existingEntry.version) >= 0;
}

function die(message: string): never {
  const error = new Error(message);
  Error.captureStackTrace(error, die);
  throw error;
}
