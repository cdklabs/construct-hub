import { gunzipSync } from 'zlib';
import { metricScope, Configuration, Unit } from 'aws-embedded-metrics';
import type { Context } from 'aws-lambda';
import { PromiseResult } from 'aws-sdk/lib/request';
import { SemVer } from 'semver';
import { HyperLogLog, createUniquesCounter } from 'streamcount';
import { METRICS_NAMESPACE, MetricName, LANGUAGE_DIMENSION } from './constants';
import * as aws from '../shared/aws.lambda-shared';
import { compressContent } from '../shared/compress-content.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { DocumentationLanguage } from '../shared/language';

Configuration.namespace = METRICS_NAMESPACE;

/**
 * Allows HyperLogLog error rate, in fraction
 */
const HYPER_LOG_LOG_ERROR = 0.01;

function defaultHll() {
  return createUniquesCounter(HYPER_LOG_LOG_ERROR);
}

export async function handler(event: InventoryCanaryEvent, context: Context) {
  console.log('Event:', JSON.stringify(event, null, 2));
  const host = new AwsInventoryHost(context);

  return realHandler(event, host);
}

export async function realHandler(
  event: InventoryCanaryEvent,
  host: IInventoryHost
) {
  const {
    continuationToken,
    packageCountEstimate,
    submoduleCountEstimate,
    packageVersionCountEstimate,
    majorVersionCountEstimate,
    indexedPackageStates,
    perLanguage,
  } = event.continuationObjectKey
    ? {
        // Do this so that if we change the fields incompatibly between two versions,
        // at least all the fields we expect will be present.
        ...freshCanaryState(),
        ...(await host.loadProgress(event.continuationObjectKey)),
      }
    : freshCanaryState();

  for await (const [keys, latestContinuationToken] of host.relevantObjectKeys(
    continuationToken
  )) {
    for (const key of keys) {
      const [, name, version] = constants.STORAGE_KEY_FORMAT_REGEX.exec(key)!;

      const pv: PackageVersion = {
        name,
        fullName: `${name}@${version}`,
        majorVersion: `${name}@${new SemVer(version).major}`,
      };

      packageCountEstimate.add(name);
      majorVersionCountEstimate.add(pv.majorVersion);
      packageVersionCountEstimate.add(pv.fullName);

      // Package-level files
      if (key.endsWith(constants.METADATA_KEY_SUFFIX)) {
        indexedPackageStates.metadataPresentEstimate.add(pv.fullName);
      } else if (key.endsWith(constants.PACKAGE_KEY_SUFFIX)) {
        indexedPackageStates.tarballPresentEstimate.add(pv.fullName);
      } else if (key.endsWith(constants.ASSEMBLY_KEY_SUFFIX)) {
        indexedPackageStates.assemblyPresentEstimate.add(pv.fullName);
      } else if (key.endsWith(constants.UNINSTALLABLE_PACKAGE_SUFFIX)) {
        indexedPackageStates.uninstallable.push(pv.fullName);
      } else {
        const classed = classifyDocumentationFile(key);
        switch (classed.type) {
          case 'known-json':
            recordPerLanguage(
              classed.lang,
              classed.supported
                ? DocumentationStatus.SUPPORTED
                : DocumentationStatus.UNSUPPORTED,
              pv,
              classed.submodule
            );

            if (classed.submodule) {
              submoduleCountEstimate.add(`${pv.fullName}.${classed.submodule}`);
            }

            break;
          case 'corrupt-assembly':
            recordPerLanguage(
              classed.lang,
              DocumentationStatus.CORRUPT_ASSEMBLY,
              pv
            );
            break;
          case 'unknown':
            indexedPackageStates.unknownObjectsEstimate.add(key);
            break;
          case 'ignore':
            break;
        }
      }
    }

    if (latestContinuationToken && host.timeToCheckpoint()) {
      host.log(
        'Running up to the Lambda time limit and there are still items to process. Saving our current progress...'
      );
      return host.saveProgress({
        continuationToken: latestContinuationToken,
        packageCountEstimate,
        majorVersionCountEstimate,
        packageVersionCountEstimate,
        submoduleCountEstimate,
        indexedPackageStates,
        perLanguage,
      });
    }
  }

  await host.metricScope(async (metrics) => {
    // Clear out default dimensions as we don't need those. See https://github.com/awslabs/aws-embedded-metrics-node/issues/73.
    metrics.setDimensions({});

    const totalPackagesEstimate = Math.floor(
      packageVersionCountEstimate.count()
    );

    // Estimate these by subtracting them from how much we expect to have found, vs how much we actually found
    const missingMetadata = Math.max(
      totalPackagesEstimate -
        Math.floor(indexedPackageStates.metadataPresentEstimate.count()),
      0
    );
    const missingTarball = Math.max(
      totalPackagesEstimate -
        Math.floor(indexedPackageStates.tarballPresentEstimate.count()),
      0
    );
    const missingAssembly = Math.max(
      totalPackagesEstimate -
        Math.floor(indexedPackageStates.assemblyPresentEstimate.count()),
      0
    );

    metrics.putMetric(
      MetricName.UNINSTALLABLE_PACKAGE_COUNT,
      indexedPackageStates.uninstallable.length,
      Unit.Count
    );
    metrics.putMetric(
      MetricName.MISSING_METADATA_COUNT,
      missingMetadata,
      Unit.Count
    );
    metrics.putMetric(
      MetricName.MISSING_ASSEMBLY_COUNT,
      missingAssembly,
      Unit.Count
    );
    metrics.putMetric(
      MetricName.MISSING_TARBALL_COUNT,
      missingTarball,
      Unit.Count
    );
    metrics.putMetric(
      MetricName.PACKAGE_COUNT,
      Math.floor(packageCountEstimate.count()),
      Unit.Count
    );
    metrics.putMetric(
      MetricName.PACKAGE_MAJOR_COUNT,
      Math.floor(majorVersionCountEstimate.count()),
      Unit.Count
    );
    metrics.putMetric(
      MetricName.PACKAGE_VERSION_COUNT,
      Math.floor(packageVersionCountEstimate.count()),
      Unit.Count
    );
    metrics.putMetric(
      MetricName.SUBMODULE_COUNT,
      Math.floor(submoduleCountEstimate.count()),
      Unit.Count
    );
    metrics.putMetric(
      MetricName.UNKNOWN_OBJECT_COUNT,
      Math.floor(indexedPackageStates.unknownObjectsEstimate.count()),
      Unit.Count
    );

    host.queueReport(
      constants.UNINSTALLABLE_PACKAGES_REPORT,
      indexedPackageStates.uninstallable
    );
  });

  for (const [language, data] of perLanguage.entries()) {
    const grainTotals: Record<Grain, number> = {
      [Grain.PACKAGES]: Math.floor(packageCountEstimate.count()),
      [Grain.PACKAGE_VERSIONS]: Math.floor(packageVersionCountEstimate.count()),
      [Grain.PACKAGE_MAJOR_VERSIONS]: Math.floor(
        majorVersionCountEstimate.count()
      ),
      [Grain.PACKAGE_VERSION_SUBMODULES]: Math.floor(
        submoduleCountEstimate.count()
      ),
    };

    await host.metricScope(async (metrics) => {
      host.log('');
      host.log('##################################################');
      host.log(`### Start of data for ${language}`);

      metrics.setDimensions({ [LANGUAGE_DIMENSION]: language.toString() });

      for (const [grain, statuses] of data.entries()) {
        let classifiedElements = 0;

        // First log all the counts we were able to find
        for (const forStatus of [
          DocumentationStatus.SUPPORTED,
          DocumentationStatus.UNSUPPORTED,
          DocumentationStatus.CORRUPT_ASSEMBLY,
        ]) {
          const countEstimate = Math.floor(
            statuses.get(forStatus)?.count() ?? 0
          );
          classifiedElements += countEstimate;
          emitGrainDocStatus(
            metrics,
            language,
            grain,
            forStatus,
            countEstimate,
            host
          );
        }

        // Then calculate MISSING by subtracting what we did find from what we expected
        const missingEstimate = Math.max(
          grainTotals[grain] - classifiedElements,
          0
        );
        emitGrainDocStatus(
          metrics,
          language,
          grain,
          DocumentationStatus.MISSING,
          missingEstimate,
          host
        );
      }

      host.log(`### End of data for ${language}`);
      host.log('##################################################');
      host.log('');
    });
  }

  await host.uploadsComplete();

  return {};

  /**
   * Registers the information for the provided language. A "MISSING" status
   * will be ignored if another status was already registered for the same
   * entity. An "UNSUPPORTED" status will be ignored if a "SUPPORTED" status
   * was already registered for the same entity.
   *
   * If a submodule is provided, only that submodule's availability is updated.
   */
  function recordPerLanguage(
    language: DocumentationLanguage,
    status: DocumentationStatus,
    pv: PackageVersion,
    submodule?: string
  ) {
    if (!perLanguage.has(language.name)) {
      const perGrainData = new Map<
        Grain,
        Map<DocumentationStatus, HyperLogLog>
      >();
      perGrainData.set(Grain.PACKAGE_MAJOR_VERSIONS, new Map());
      perGrainData.set(Grain.PACKAGES, new Map());
      perGrainData.set(Grain.PACKAGE_VERSION_SUBMODULES, new Map());
      perGrainData.set(Grain.PACKAGE_VERSIONS, new Map());
      perLanguage.set(language.name, perGrainData);
    }
    const data = perLanguage.get(language.name)!;

    // If there is a submodule, only update the submodule domain.
    const outputDomains: readonly [
      Map<DocumentationStatus, HyperLogLog>,
      string
    ][] = submodule
      ? [
          [
            data.get(Grain.PACKAGE_VERSION_SUBMODULES)!,
            `${pv.fullName}.${submodule}`,
          ],
        ]
      : [
          [data.get(Grain.PACKAGE_MAJOR_VERSIONS)!, pv.majorVersion],
          [data.get(Grain.PACKAGE_VERSIONS)!, pv.fullName],
          [data.get(Grain.PACKAGES)!, pv.name],
        ];

    // Then add the name to every cardinality estimator
    for (const [map, name] of outputDomains) {
      if (!map.has(status)) {
        map.set(status, defaultHll());
      }
      map.get(status)?.add(name);
    }
  }
}

function emitGrainDocStatus(
  metrics: IMetrics,
  language: string,
  grain: Grain,
  status: DocumentationStatus,
  count: number,
  host: IInventoryHost
) {
  const metricName =
    METRIC_NAME_BY_STATUS_AND_GRAIN[status as DocumentationStatus][
      grain as Grain
    ];

  host.log(`${status} ${grain} for ${language}: ${count} entries`);
  metrics.putMetric(metricName, count, Unit.Count);
}

/**
 * This function obtains a regular expression with a capture group that allows
 * determining the submodule name from a submodule documentation key, and
 * another to determine whether the object is an "unsupported beacon" or not.
 */
function submoduleKeyRegexp(
  language: DocumentationLanguage,
  fileExt: string
): RegExp {
  // We use a placeholder to be able to insert the capture group once we have
  // fully quoted the key prefix for Regex safety.
  const placeholder = '<SUBMODULENAME>';

  // We obtain the standard key suffix.
  const keyPrefix = constants.docsKeySuffix(language, placeholder, fileExt);

  // Finally, assemble the regular expression with the capture group.
  return new RegExp(
    `.*${reQuote(keyPrefix).replace(placeholder, '(.+)')}(${reQuote(
      constants.NOT_SUPPORTED_SUFFIX
    )})?$`
  );

  /**
   * Escapes all "speacial meaning" characters in a string, so it can be used as
   * part of a regular expression.
   */
  function reQuote(str: string): string {
    return str.replace(/([+*.()?$[\]])/g, '\\$1');
  }
}

export const enum Grain {
  PACKAGE_MAJOR_VERSIONS = 'package major versions',
  PACKAGE_VERSION_SUBMODULES = 'package version submodules',
  PACKAGE_VERSIONS = 'package versions',
  PACKAGES = 'packages',
}

export const enum DocumentationStatus {
  /**
   * There is no documentation for this package/version/submodule
   *
   * This status is theoretical, and signaled by the absence of any of the other statuses.
   */
  MISSING = 'Missing',

  /**
   * This package does not support the given language.
   */
  UNSUPPORTED = 'Unsupported',

  /**
   * This package has a corrupted JSII assembly so we can't generate
   * documentation for it.
   */
  CORRUPT_ASSEMBLY = 'CorruptAssembly',

  /**
   * This package supports the given language and has documentation for it.
   */
  SUPPORTED = 'Supported',
}

const METRIC_NAME_BY_STATUS_AND_GRAIN: {
  readonly [status in DocumentationStatus]: {
    readonly [grain in Grain]: MetricName;
  };
} = {
  [DocumentationStatus.MISSING]: {
    [Grain.PACKAGES]: MetricName.PER_LANGUAGE_MISSING_PACKAGES,
    [Grain.PACKAGE_MAJOR_VERSIONS]: MetricName.PER_LANGUAGE_MISSING_MAJORS,
    [Grain.PACKAGE_VERSIONS]: MetricName.PER_LANGUAGE_MISSING_VERSIONS,
    [Grain.PACKAGE_VERSION_SUBMODULES]:
      MetricName.PER_LANGUAGE_MISSING_SUBMODULES,
  },
  [DocumentationStatus.UNSUPPORTED]: {
    [Grain.PACKAGES]: MetricName.PER_LANGUAGE_UNSUPPORTED_PACKAGES,
    [Grain.PACKAGE_MAJOR_VERSIONS]: MetricName.PER_LANGUAGE_UNSUPPORTED_MAJORS,
    [Grain.PACKAGE_VERSIONS]: MetricName.PER_LANGUAGE_UNSUPPORTED_VERSIONS,
    [Grain.PACKAGE_VERSION_SUBMODULES]:
      MetricName.PER_LANGUAGE_UNSUPPORTED_SUBMODULES,
  },
  [DocumentationStatus.SUPPORTED]: {
    [Grain.PACKAGES]: MetricName.PER_LANGUAGE_SUPPORTED_PACKAGES,
    [Grain.PACKAGE_MAJOR_VERSIONS]: MetricName.PER_LANGUAGE_SUPPORTED_MAJORS,
    [Grain.PACKAGE_VERSIONS]: MetricName.PER_LANGUAGE_SUPPORTED_VERSIONS,
    [Grain.PACKAGE_VERSION_SUBMODULES]:
      MetricName.PER_LANGUAGE_SUPPORTED_SUBMODULES,
  },
  [DocumentationStatus.CORRUPT_ASSEMBLY]: {
    [Grain.PACKAGES]: MetricName.PER_LANGUAGE_CORRUPT_ASSEMBLY_PACKAGES,
    [Grain.PACKAGE_MAJOR_VERSIONS]:
      MetricName.PER_LANGUAGE_CORRUPT_ASSEMBLY_MAJORS,
    [Grain.PACKAGE_VERSIONS]: MetricName.PER_LANGUAGE_CORRUPT_ASSEMBLY_VERSIONS,
    [Grain.PACKAGE_VERSION_SUBMODULES]:
      MetricName.PER_LANGUAGE_CORRUPT_ASSEMBLY_SUBMODULES,
  },
};

/**
 * We have a markdown or JSON file from a particular language
 *
 * Pattern:
 *
 * ```
 * data/<package>/v<version>/docs-[<submodule>-]<language>.<json|md>[.not-supported]
 * ```
 *
 * Try to identify it
 */
export function classifyDocumentationFile(key: string): FileClassification {
  for (const lang of DocumentationLanguage.ALL) {
    const re = submoduleKeyRegexp(lang, 'json');
    const matchJson = re.exec(key);
    if (matchJson != null) {
      const [, submodule, isUnsupported] = matchJson;

      return {
        type: 'known-json',
        lang,
        supported: !isUnsupported,
        submodule,
      };
    }

    if (key.endsWith(constants.docsKeySuffix(lang, undefined, 'json'))) {
      return { type: 'known-json', lang, supported: true };
    }

    if (
      key.endsWith(constants.notSupportedKeySuffix(lang, undefined, 'json'))
    ) {
      return { type: 'known-json', lang, supported: false };
    }

    if (
      key.endsWith(constants.corruptAssemblyKeySuffix(lang, undefined, 'json'))
    ) {
      return { type: 'corrupt-assembly', lang };
    }

    // Currently we generate both JSON files and markdown files, so for now
    // we record JSON files as the source of truth, but still identify
    // markdown files so they are not counted as unknown.
    const matchMd = submoduleKeyRegexp(lang, 'md').exec(key);
    if (
      matchMd != null ||
      key.endsWith(constants.docsKeySuffix(lang, undefined, 'md')) ||
      key.endsWith(constants.notSupportedKeySuffix(lang, undefined, 'md')) ||
      key.endsWith(constants.corruptAssemblyKeySuffix(lang, undefined, 'md'))
    ) {
      return { type: 'ignore' };
    }
  }

  // Awww
  return { type: 'unknown' };
}

/**
 * Expected input event structure as passed by the state machine.
 */
export interface InventoryCanaryEvent {
  readonly continuationObjectKey?: string;
}

/**
 * Intermediate state stored between invocations of the inventory canary.
 *
 * The canary accumulates data into this structure as it runs, until it is
 * finished. This structure is serialized to JSON in its entirety, so it may
 * not exceed 512MB.
 *
 * We therefore have to be clever around what and how we store data.
 */
export interface InventoryCanaryState {
  // Next page to continue
  readonly continuationToken: string | undefined;

  // We are only interested in cardinalities of these, so we use a streaming cardinality
  // estimator.
  readonly packageCountEstimate: HyperLogLog;
  readonly packageVersionCountEstimate: HyperLogLog;
  readonly majorVersionCountEstimate: HyperLogLog;
  readonly submoduleCountEstimate: HyperLogLog;

  // This used to be a map of <packageVersion -> { bunch of booleans }}, where we used to collect
  // all positives so that at the end we could report on the negatives (i.e., all packages for which
  // we hadn't seen valid assemblies/tarballs/etc).
  //
  // To save space, we now estimate the positives using a streaming cadinality
  // estimator and substract them from the estimated total to obtain the
  // estimated negatives.
  //
  // All of these are counted per PackageVersion (so per `package@1.2.3`).
  readonly indexedPackageStates: {
    readonly metadataPresentEstimate: HyperLogLog;
    readonly tarballPresentEstimate: HyperLogLog;
    readonly assemblyPresentEstimate: HyperLogLog;
    readonly unknownObjectsEstimate: HyperLogLog;

    // We want a full list of these so that we can report on it
    readonly uninstallable: string[];
  };

  // For every (language, grain, status) we estimate the count
  //
  // Grain is one of (Packages, PackageVersions, PackageMajorVersions, PackageVersionSubmodules).
  readonly perLanguage: Map<string, PerLanguageData>;
}

/**
 * This used to be a map of { Grain -> { Package -> DocumentationStatus }}, so that
 * at the end we could count all the packages of a particular status, and report on some.
 *
 * We no longer collect full lists; instead we only collect cardinalities for most documentation
 * statuses (except MISSING, which we will derive by subtracting the sum total of the other statuses
 * from the total number of packages we are expecting).
 */
export type PerLanguageData = Map<Grain, Map<DocumentationStatus, HyperLogLog>>;

type Serialized<T> = string & { _serialized: T };

/**
 * Replacer that can be used in JSON.stringify to automatically turn objects back into maps
 * and arrays back into sets where appropriate.
 */
function safeReplacer(_key: string, value: any) {
  if (isHyperLogLog(value)) {
    return {
      _type: 'HLL',
      value: value.serialize().toString('base64'),
    };
  } else if (value instanceof Map) {
    return {
      _type: 'Map',
      value: Array.from(value.entries()),
    };
  } else if (value instanceof Set) {
    return {
      _type: 'Set',
      value: Array.from([...value]),
    };
  } else {
    return value;
  }
}

function safeReviver(_key: string, value: any) {
  if (typeof value === 'object' && value !== null) {
    if (value._type === 'HLL') {
      return HyperLogLog.deserialize(Buffer.from(value.value, 'base64'));
    }
    if (value._type === 'Map') {
      return new Map(value.value);
    }
    if (value._type === 'Set') {
      return new Set(value.value);
    }
  }
  return value;
}

export function serialize<T>(value: T): Serialized<T> {
  return JSON.stringify(value, safeReplacer) as Serialized<T>;
}

export function deserialize<T>(value: Serialized<T>): T {
  return JSON.parse(value, safeReviver);
}

export function freshCanaryState(): InventoryCanaryState {
  return {
    continuationToken: undefined,
    packageCountEstimate: defaultHll(),
    submoduleCountEstimate: defaultHll(),
    packageVersionCountEstimate: defaultHll(),
    majorVersionCountEstimate: defaultHll(),
    perLanguage: new Map<string, PerLanguageData>(),
    indexedPackageStates: {
      assemblyPresentEstimate: defaultHll(),
      metadataPresentEstimate: defaultHll(),
      tarballPresentEstimate: defaultHll(),
      unknownObjectsEstimate: defaultHll(),
      uninstallable: new Array<string>(),
    },
  };
}

export function isHyperLogLog(x: any): x is HyperLogLog {
  return x && typeof x === 'object' && x.serialize && x.count && x.add && x.M;
}

/**
 * All the functions we need to abstract over to unit test this
 */
export interface IInventoryHost {
  log(...xs: any[]): void;

  loadProgress(continuationObjectKey: string): Promise<InventoryCanaryState>;
  saveProgress(state: InventoryCanaryState): Promise<InventoryCanaryEvent>;

  queueReport(reportKey: string, packageVersions: string[]): void;
  uploadsComplete(): Promise<void>;

  relevantObjectKeys(
    continuationToken?: string
  ): AsyncGenerator<[string[], string | undefined], void, void>;

  /** Whether it's time to stop this invocation and have the State Machine start another Lambda */
  timeToCheckpoint(): boolean;

  metricScope(block: (m: IMetrics) => Promise<void>): Promise<void>;
}

export interface IMetrics {
  setDimensions(dimensionSet: Record<string, string>): IMetrics;
  putMetric(key: string, value: number, unit?: Unit | string): IMetrics;
}

export class AwsInventoryHost implements IInventoryHost {
  private readonly scratchworkBucket: string;
  private readonly packageDataBucket: string;
  private reports: Promise<
    PromiseResult<AWS.S3.PutObjectOutput, AWS.AWSError>
  >[] = [];

  constructor(private readonly context: Context) {
    this.scratchworkBucket = requireEnv('SCRATCHWORK_BUCKET_NAME');
    this.packageDataBucket = requireEnv('PACKAGE_DATA_BUCKET_NAME');
  }

  public log(...xs: any[]): void {
    console.log(...xs);
  }

  public timeToCheckpoint() {
    return this.context.getRemainingTimeInMillis() <= MAX_SHUTDOWN_TIME;
  }

  /**
   * List all objects in the bucket, yielding batches of up to 1000 keys. Also
   * yields the next continuation token if there is one.
   */
  public async *relevantObjectKeys(
    continuationToken?: string
  ): AsyncGenerator<[string[], string | undefined], void, void> {
    const request: AWS.S3.ListObjectsV2Request = {
      Bucket: this.packageDataBucket,
      Prefix: constants.STORAGE_KEY_PREFIX,
    };
    if (continuationToken) request.ContinuationToken = continuationToken;

    do {
      const response = await aws.s3().listObjectsV2(request).promise();
      const keys = [];
      for (const { Key } of response.Contents ?? []) {
        if (Key == null) {
          continue;
        }
        keys.push(Key);
      }
      yield [keys, response.ContinuationToken];
      request.ContinuationToken = response.NextContinuationToken;
    } while (request.ContinuationToken != null);
  }

  public async saveProgress(
    state: InventoryCanaryState
  ): Promise<InventoryCanaryEvent> {
    console.log('Serializing data...');
    const serializedState: Serialized<InventoryCanaryState> = serialize(state);
    console.log('Serializing finished.');

    const { buffer, contentEncoding } = compressContent(
      Buffer.from(serializedState)
    );

    const keyName = `inventory-canary-progress-${Date.now()}`;
    await aws
      .s3()
      .putObject({
        Bucket: this.scratchworkBucket,
        Key: keyName,
        Body: buffer,
        ContentType: 'application/json',
        ContentEncoding: contentEncoding,
        Metadata: {
          'Lambda-Log-Group': this.context.logGroupName,
          'Lambda-Log-Stream': this.context.logStreamName,
          'Lambda-Run-Id': this.context.awsRequestId,
        },
      })
      .promise();
    return {
      continuationObjectKey: keyName,
    };
  }

  public async loadProgress(continuationObjectKey: string) {
    console.log(
      'Found a continuation object key, retrieving data from the existing run...'
    );
    let { Body, ContentEncoding } = await aws
      .s3()
      .getObject({
        Bucket: this.scratchworkBucket,
        Key: continuationObjectKey,
      })
      .promise();
    // If it was compressed, decompress it.
    if (ContentEncoding === 'gzip') {
      Body = gunzipSync(Buffer.from(Body! as any));
    }
    if (!Body) {
      throw new Error(
        `Object key "${continuationObjectKey}" not found in bucket "${this.scratchworkBucket}".`
      );
    }
    console.log('Deserializing data...');
    const serializedState = Body.toString(
      'utf-8'
    ) as Serialized<InventoryCanaryState>;
    const state = deserialize(serializedState);
    console.log('Deserializing finished.');
    return state;
  }

  public queueReport(reportKey: string, packageVersions: string[]) {
    const report = JSON.stringify(packageVersions, null, 2);
    const { buffer, contentEncoding } = compressContent(Buffer.from(report));
    console.log(
      `Uploading list to s3://${this.packageDataBucket}/${reportKey}`
    );
    this.reports.push(
      aws
        .s3()
        .putObject({
          Body: buffer,
          Bucket: this.packageDataBucket,
          ContentEncoding: contentEncoding,
          ContentType: 'application/json',
          Expires: new Date(Date.now() + 300_000), // 5 minutes from now
          Key: reportKey,
          Metadata: {
            'Lambda-Run-Id': this.context.awsRequestId,
            'Lambda-Log-Group-Name': this.context.logGroupName,
            'Lambda-Log-Stream-Name': this.context.logStreamName,
          },
        })
        .promise()
    );
  }

  public async uploadsComplete() {
    for (const report of this.reports) {
      await report;
    }
  }

  public metricScope(block: (m: IMetrics) => Promise<void>): Promise<void> {
    return metricScope((m) => () => block(m))();
  }
}

/**
 * The time margin when we need to stop working through S3 keys when we're nearing the end of the Lambda time slice.
 *
 * Needs to account for the time taken to do both:
 *
 * - Going through the list+process loop one more time
 * - Creating metrics and uploading reports
 *
 * When we used to have this at 1 minute, we hit ~1 timeout a day. So set the margin
 * a bit wider than that.
 */
const MAX_SHUTDOWN_TIME = 120_000;

/**
 * Identifier for a package version
 */
interface PackageVersion {
  /** 'package' */
  readonly name: string;
  /** 'package@1.2.3' */
  readonly fullName: string;
  /** 'package@1' */
  readonly majorVersion: string;
}

export type FileClassification =
  | {
      type: 'known-json';
      lang: DocumentationLanguage;
      supported: boolean;
      submodule?: string;
    }
  | { type: 'corrupt-assembly'; lang: DocumentationLanguage }
  | { type: 'ignore' }
  | { type: 'unknown' };
