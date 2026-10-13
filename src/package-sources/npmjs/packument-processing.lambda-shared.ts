import { InvokeCommand } from '@aws-sdk/client-lambda';
import { MetricsLogger, Unit } from 'aws-embedded-metrics';
import { MetricName } from './constants.lambda-shared';
import {
  CouchChanges,
  DatabaseChange,
  parseSequentialRevision,
} from './couch-changes.lambda-shared';
import { KnownVersions } from './known-versions.lambda-shared';
import type { PackageVersion } from './stage-and-notify.lambda';
import { DenyListClient } from '../../backend/deny-list/client.lambda-shared';
import { LicenseListClient } from '../../backend/license-list/client.lambda-shared';
import { LAMBDA_CLIENT } from '../../backend/shared/aws.lambda-shared';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const normalizeNPMMetadata = require('normalize-registry-metadata');

const CONSTRUCT_KEYWORDS: ReadonlySet<string> = new Set([
  'cdk',
  'aws-cdk',
  'awscdk',
  'cdk8s',
  'cdktf',
]);

/**
 * What processing a packument needs: where to send relevant versions, which
 * versions to skip, and where to record the processed ones.
 */
export interface PackumentProcessingContext {
  /** The name of the staging function. */
  readonly stagingFunction: string;
  readonly denyList: DenyListClient;
  readonly licenseList: LicenseListClient;
  readonly knownVersions: KnownVersions;
}

/**
 * Processes packuments: identifies the relevant package versions they contain
 * (construct libraries, not denied, with an eligible license, not processed
 * before), sends them for staging, and records them as known versions. The
 * caller persists the known versions (`KnownVersions.flush`).
 *
 * @param changes change entries with their packument attached as `doc`.
 *
 * @returns the number of package versions sent for staging.
 */
export async function processPackuments(
  changes: readonly DatabaseChange[],
  metrics: MetricsLogger,
  context: PackumentProcessingContext
): Promise<number> {
  const versionInfos = await getRelevantVersionInfos(
    changes as unknown as readonly Change[],
    metrics,
    context.denyList,
    context.licenseList,
    context.knownVersions
  );
  console.log(
    `Identified ${versionInfos.length} relevant package version update(s)`
  );
  metrics.putMetric(
    MetricName.RELEVANT_PACKAGE_VERSIONS,
    versionInfos.length,
    Unit.Count
  );
  await stageVersions(
    versionInfos,
    context.stagingFunction,
    context.knownVersions
  );
  return versionInfos.length;
}

/**
 * A request to process a package from the registry, and to keep checking it
 * until the registry serves at least the announced revision.
 */
export interface PackumentRequest {
  /** The package name. */
  readonly name: string;
  /** The sequential revision announced by the changes feed. */
  readonly expectedRev: number;
  /** The changes feed position that announced it, if known. */
  readonly seq?: number;
  /** When the request was first made (epoch milliseconds). */
  readonly firstSeen: number;
  /**
   * Why the package is checked again: the registry served an older revision
   * than announced (`laggy`), or no packument at all (`missing`).
   *
   * @default 'laggy'
   */
  readonly reason?: PackumentRequestReason;
}

/** Why a package is checked again. */
export type PackumentRequestReason = 'laggy' | 'missing';

/** The outcome of `checkPackument`. */
export type PackumentCheckResult =
  /** The registry serves the expected revision (or a newer one). */
  | 'caught-up'
  /** The registry still serves an older revision. */
  | 'laggy'
  /** The registry has no packument for the package (HTTP 404). */
  | 'missing';

/**
 * Fetches the packument a request is about from the registry, processes the
 * versions it contains (whatever revision it is at), and reports whether the
 * registry has caught up with the expected revision.
 */
export async function checkPackument(
  npm: CouchChanges,
  request: PackumentRequest,
  metrics: MetricsLogger,
  context: PackumentProcessingContext
): Promise<PackumentCheckResult> {
  const doc = await npm.getPackageDoc(request.name);
  if (doc == null || doc._rev == null) {
    return 'missing';
  }
  const change: DatabaseChange = {
    changes: [{ rev: doc._rev as string }],
    deleted: false,
    id: request.name,
    seq: request.seq,
    doc,
  };
  await processPackuments([change], metrics, context);
  return parseSequentialRevision(doc._rev as string) >= request.expectedRev
    ? 'caught-up'
    : 'laggy';
}

/**
 * Sends the provided package version updates to the staging function
 * ("fire-and-forget"), and records them as known versions.
 */
export async function stageVersions(
  versionInfos: readonly UpdatedVersion[],
  stagingFunction: string,
  knownVersions: KnownVersions
): Promise<void> {
  await Promise.all(
    versionInfos.map(async ({ packageName, infos, modified, seq }) => {
      const invokeArgs: PackageVersion = {
        integrity: infos.dist.shasum,
        modified: modified.toISOString(),
        name: infos.name,
        seq: seq?.toString(),
        tarballUrl: infos.dist.tarball,
        version: infos.version,
      };
      // "Fire-and-forget" invocation here.
      console.log(`Sending ${invokeArgs.tarballUrl} for staging`);
      await LAMBDA_CLIENT.send(
        new InvokeCommand({
          FunctionName: stagingFunction,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify(invokeArgs)),
        })
      );
      // Record that this is now a "known" version (no need to re-discover)
      knownVersions.add(packageName, infos.version);
    })
  );
}

/**
 * Obtains the `VersionInfo` corresponding to the modified version(s) in the
 * provided `Change` objects, ensures they are relevant (construct libraries),
 * and returns those only.
 *
 * Known versions are only looked up for packages that have at least one
 * construct library version: only those versions are ever recorded, so every
 * other package has no known versions by definition. Changes are processed
 * concurrently; the result keeps their order.
 *
 * @param changes the changes to be processed.
 * @param metrics the metrics logger to use.
 * @param denyList deny list client
 *
 * @returns a list of `VersionInfo` objects
 */
export async function getRelevantVersionInfos(
  changes: readonly Change[],
  metrics: MetricsLogger,
  denyList: DenyListClient,
  licenseList: LicenseListClient,
  knownVersions: KnownVersions
): Promise<readonly UpdatedVersion[]> {
  const perChange = await Promise.all(
    changes.map((change) => relevantVersionInfosOf(change))
  );
  return perChange.flat();

  async function relevantVersionInfosOf(
    change: Change
  ): Promise<readonly UpdatedVersion[]> {
    // Filter out all elements that don't have a "name" in the document, as
    // these are schemas, which are not relevant to our business here.
    if (change.doc.name === undefined) {
      console.error(
        `[${change.seq}] Changed document contains no 'name': ${change.id}`
      );
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      return [];
    }

    // The normalize function change the object in place, if the doc object is invalid it will return undefined
    if (normalizeNPMMetadata(change.doc) === undefined) {
      console.error(
        `[${change.seq}] Changed document invalid, npm normalize returned undefined: ${change.id}`
      );
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      return [];
    }

    // Sometimes, there are no versions in the document. We skip those.
    if (change.doc.versions == null) {
      console.error(
        `[${change.seq}] Changed document contains no 'versions': ${change.id}`
      );
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      return [];
    }

    // Sometimes, there is no 'time' entry in the document. We skip those.
    if (change.doc.time == null) {
      console.error(
        `[${change.seq}] Changed document contains no 'time': ${change.id}`
      );
      metrics.putMetric(MetricName.UNPROCESSABLE_ENTITY, 1, Unit.Count);
      return [];
    }

    const name = change.doc.name;
    const isRelevant = Object.values(change.doc.versions).some(
      (infos) => infos != null && isConstructLibrary(infos)
    );

    // Get the last modification date from the change
    const packageVersionUpdates = Object.entries(change.doc.time)
      // Ignore the "created" and "modified" keys here
      .filter(([key]) => key !== 'created' && key !== 'modified')
      // Parse all the dates to ensure they are comparable
      .map(([version, isoDate]) => [version, new Date(isoDate)] as const);
    metrics.putMetric(
      MetricName.PACKAGE_VERSION_COUNT,
      packageVersionUpdates.length,
      Unit.Count
    );

    const result = new Array<UpdatedVersion>();
    const unpublishedVersions: string[] = [];
    for (const [version, modified] of packageVersionUpdates) {
      if (isRelevant && (await knownVersions.has(name, version))) {
        continue;
      }
      const infos = change.doc.versions[version];
      if (infos == null) {
        // Could be the version in question was un-published.
        unpublishedVersions.push(`${name}@${version}`);
      } else if (isConstructLibrary(infos)) {
        // skip if this package is denied
        const denied = denyList.lookup(infos.name, infos.version);
        if (denied) {
          console.log(
            `[${change.seq}] Package denied: ${JSON.stringify(denied)}`
          );
          knownVersions.add(name, version);
          metrics.putMetric(MetricName.DENY_LISTED_COUNT, 1, Unit.Count);
          continue;
        }

        metrics.putMetric(
          MetricName.PACKAGE_VERSION_AGE,
          Date.now() - modified.getTime(),
          Unit.Milliseconds
        );
        const isEligible =
          licenseList.lookup(infos.license ?? 'UNLICENSED') != null;
        metrics.putMetric(
          MetricName.INELIGIBLE_LICENSE,
          isEligible ? 0 : 1,
          Unit.Count
        );
        if (isEligible) {
          result.push({
            packageName: name,
            infos,
            modified,
            seq: change.seq,
          });
        } else {
          console.log(
            `[${
              change.seq
            }] Package "${name}@${version}" does not use allow-listed license: ${
              infos.license ?? 'UNLICENSED'
            }`
          );
          knownVersions.add(name, version);
        }
      }
      // Else this is not a construct library, so we'll just ignore it...
    }

    if (unpublishedVersions.length > 0) {
      console.log(
        `[${
          change.seq
        }] Could not find info for the following versions. Were they un-published?\n${unpublishedVersions.join(
          ',\n'
        )}`
      );
    }
    return result;
  }

  /**
   * This determines whether a package is "interesting" to ConstructHub or not. This is related but
   * not necessarily identical to the logic in the ingestion process that annotates package metadata
   * with a construct framework name + version (those could ultimately be re-factored to share more
   * of the logic/heuristics, though).
   *
   * Concretely, it checks for a list of known "official" packages for various construct frameworks,
   * and packages that have a dependency on such a package. It also has a keywords allow-list as a
   * fall-back (the current dependency-based logic does not consider transitive dependencies and
   * might hence miss certain rare use-cases, which keywords would rescue).
   */
  function isConstructLibrary(infos: VersionInfo): boolean {
    if (infos.jsii == null) {
      return false;
    }
    // The "constructs" package is a sign of a constructs library
    return (
      isConstructFrameworkPackage(infos.name) ||
      // Recursively apply on dependencies
      Object.keys(infos.dependencies ?? {}).some(isConstructFrameworkPackage) ||
      Object.keys(infos.devDependencies ?? {}).some(
        isConstructFrameworkPackage
      ) ||
      Object.keys(infos.peerDependencies ?? {}).some(
        isConstructFrameworkPackage
      ) ||
      // Keyword-based fallback
      infos.keywords?.some((kw) => CONSTRUCT_KEYWORDS.has(kw))
    );
  }

  /**
   * Package is one of the known construct framework's first party packages:
   * - @aws-cdk/*
   * - @cdktf/*
   * - cdk8s or cdk8s-plus
   */
  function isConstructFrameworkPackage(name: string): boolean {
    // IMPORTANT NOTE: Prefix matching should only be used for @scope/ names.

    // The low-level constructs package
    return (
      name === 'constructs' ||
      // AWS CDK Packages
      name === 'aws-cdk-lib' ||
      name === 'monocdk' ||
      name.startsWith('@aws-cdk/') ||
      // CDK8s packages
      name === 'cdk8s' ||
      /^cdk8s-plus(?:-(?:17|20|21|22))?$/.test(name) ||
      // CDKTf packages
      name === 'cdktf' ||
      name.startsWith('@cdktf/')
    );
  }
}

/**
 * The scheme of a package version in the update. Includes the package.json keys, as well as some additional npm metadata
 * @see https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#version
 */
export interface VersionInfo {
  readonly dependencies?: { readonly [name: string]: string };
  readonly devDependencies?: { readonly [name: string]: string };
  readonly peerDependencies?: { readonly [name: string]: string };
  readonly jsii: unknown;
  readonly license?: string;
  readonly name: string;
  readonly [key: string]: unknown;
  readonly keywords: string[];
  readonly dist: {
    readonly shasum: string;
    readonly tarball: string;
  };
  readonly version: string;
}

export interface UpdatedVersion {
  /**
   * The name of the package document the version was found in (the key under
   * which known versions are recorded).
   */
  readonly packageName: string;

  /**
   * The `VersionInfo` for the modified package version.
   */
  readonly infos: VersionInfo;

  /**
   * The time at which the `VersionInfo` was last modified.
   */
  readonly modified: Date;

  /**
   * The CouchDB transaction number for the update.
   */
  readonly seq?: string | number;
}

interface Document {
  /**
   * a List of all Version objects for the package
   */
  readonly versions: { [key: string]: VersionInfo | undefined };

  /**
   * The package's name.
   */
  readonly name: string;

  /**
   * Timestamps associated with this document. The values are ISO-8601 encoded
   * timestamps.
   */
  readonly time: {
    readonly created: string;
    readonly modified: string;
    readonly [version: string]: string;
  };

  readonly [key: string]: unknown;
}

interface Change extends DatabaseChange {
  readonly doc: Document;
}
