import * as path from 'path';
import * as fs from 'fs-extra';
import { createUniquesCounter } from 'streamcount';
import {
  serialize,
  deserialize,
  InventoryCanaryState,
  Grain,
  DocumentationStatus,
  freshCanaryState,
  isHyperLogLog,
  IInventoryHost,
  InventoryCanaryEvent,
  realHandler,
  IMetrics,
  classifyDocumentationFile,
  FileClassification,
} from '../../../backend/inventory/canary.lambda';
import { DocumentationLanguage } from '../../../backend/shared/language';

test('simple hyperloglog test', () => {
  const N = 1000;
  const log = createUniquesCounter();
  for (let i = 0; i < N; i++) {
    log.add(`${Math.random()}`);
  }

  const estimate = log.count();
  expect(estimate).toBeGreaterThan(900);
  expect(estimate).toBeLessThan(1100);
});

test.each([
  [
    'data/@awlsring/cdktf-proxmox/v0.0.124/docs-dataProxmoxNetworkBridges-java.json.not-supported',
    {
      type: 'known-json',
      lang: DocumentationLanguage.JAVA,
      supported: false,
      submodule: 'dataProxmoxNetworkBridges',
    } as FileClassification,
  ],
  [
    'data/@awlsring/cdktf-proxmox/v0.0.123/docs-dataProxmoxTemplates-typescript.md',
    { type: 'ignore' },
  ],
  [
    'data/@awlsring/cdktf-proxmox/v0.0.123/docs-csharp.json',
    { type: 'known-json', lang: DocumentationLanguage.CSHARP, supported: true },
  ],
  [
    'data/@bluedynamics/cdk8s-plone/v0.0.49/docs-python.*.transliteration-failed',
    { type: 'transliteration-error', lang: DocumentationLanguage.PYTHON },
  ],
] satisfies Array<[string, FileClassification]>)(
  'classify key %p',
  (key, expected) => {
    expect(classifyDocumentationFile(key)).toEqual(expected);
  }
);

test('can serialize and deserialize the inventory state', () => {
  // GIVEN
  const state: Mutable<InventoryCanaryState> = freshCanaryState();
  state.continuationToken = 'token';
  state.packageCountEstimate.add('package');
  state.majorVersionCountEstimate.add('package@1');
  state.packageVersionCountEstimate.add('package@1.2.3');
  state.submoduleCountEstimate.add('package@1.2.3.submodule');
  state.indexedPackageStates.assemblyPresentEstimate.add('package@1.2.3');
  state.indexedPackageStates.metadataPresentEstimate.add('package@1.2.3');
  state.indexedPackageStates.tarballPresentEstimate.add('package@1.2.3');
  state.indexedPackageStates.unknownObjectsEstimate.add('package@1.2.3');

  state.perLanguage.set(
    'python',
    new Map([
      [
        Grain.PACKAGES,
        new Map([[DocumentationStatus.SUPPORTED, createUniquesCounter()]]),
      ],
    ])
  );

  // WHEN
  const serialized = serialize(state);
  const deserialized = deserialize(serialized);

  // THEN
  expect(replaceHyperLogLog(state)).toEqual(replaceHyperLogLog(deserialized));
});

test('simulate canary on actual keys', async () => {
  const projectRoot = path.join(__dirname, '..', '..', '..', '..');
  const keys = fs
    .readFileSync(`${projectRoot}/src/__tests__/testdata/keyslist.txt`, {
      encoding: 'utf-8',
    })
    .split('\n')
    .filter((x) => x);
  const host = new FakeInventoryHost(keys);

  // The do/while loop simulates the State Machine that is normally around the Lambda
  let event: InventoryCanaryEvent = {};
  do {
    event = await realHandler(event, host);
  } while (event.continuationObjectKey);

  expect(host.metrics).toMatchInlineSnapshot(`
    {
      "MissingAssemblyCount": 0,
      "MissingPackageMetadataCount": 1,
      "MissingPackageTarballCount": 1,
      "PackageCount": 19,
      "PackageMajorVersionCount": 20,
      "PackageVersionCount": 953,
      "SubmoduleCount": 2215,
      "UninstallablePackageCount": 3,
      "UnknownObjectCount": 0,
      "{Language=csharp}CorruptAssemblyMajorVersionCount": 0,
      "{Language=csharp}CorruptAssemblyPackageCount": 0,
      "{Language=csharp}CorruptAssemblyPackageVersionCount": 0,
      "{Language=csharp}CorruptAssemblySubmoduleCount": 0,
      "{Language=csharp}MissingMajorVersionCount": 0,
      "{Language=csharp}MissingPackageCount": 0,
      "{Language=csharp}MissingPackageVersionCount": 0,
      "{Language=csharp}MissingSubmoduleCount": 0,
      "{Language=csharp}SupportedMajorVersionCount": 3,
      "{Language=csharp}SupportedPackageCount": 3,
      "{Language=csharp}SupportedPackageVersionCount": 497,
      "{Language=csharp}SupportedSubmoduleCount": 2200,
      "{Language=csharp}UnsupportedMajorVersionCount": 20,
      "{Language=csharp}UnsupportedPackageCount": 19,
      "{Language=csharp}UnsupportedPackageVersionCount": 667,
      "{Language=csharp}UnsupportedSubmoduleCount": 1151,
      "{Language=go}CorruptAssemblyMajorVersionCount": 0,
      "{Language=go}CorruptAssemblyPackageCount": 0,
      "{Language=go}CorruptAssemblyPackageVersionCount": 0,
      "{Language=go}CorruptAssemblySubmoduleCount": 0,
      "{Language=go}MissingMajorVersionCount": 0,
      "{Language=go}MissingPackageCount": 0,
      "{Language=go}MissingPackageVersionCount": 0,
      "{Language=go}MissingSubmoduleCount": 0,
      "{Language=go}SupportedMajorVersionCount": 7,
      "{Language=go}SupportedPackageCount": 6,
      "{Language=go}SupportedPackageVersionCount": 61,
      "{Language=go}SupportedSubmoduleCount": 5,
      "{Language=go}UnsupportedMajorVersionCount": 20,
      "{Language=go}UnsupportedPackageCount": 19,
      "{Language=go}UnsupportedPackageVersionCount": 948,
      "{Language=go}UnsupportedSubmoduleCount": 2215,
      "{Language=java}CorruptAssemblyMajorVersionCount": 0,
      "{Language=java}CorruptAssemblyPackageCount": 0,
      "{Language=java}CorruptAssemblyPackageVersionCount": 0,
      "{Language=java}CorruptAssemblySubmoduleCount": 0,
      "{Language=java}MissingMajorVersionCount": 0,
      "{Language=java}MissingPackageCount": 0,
      "{Language=java}MissingPackageVersionCount": 0,
      "{Language=java}MissingSubmoduleCount": 0,
      "{Language=java}SupportedMajorVersionCount": 2,
      "{Language=java}SupportedPackageCount": 1,
      "{Language=java}SupportedPackageVersionCount": 32,
      "{Language=java}SupportedSubmoduleCount": 5,
      "{Language=java}UnsupportedMajorVersionCount": 20,
      "{Language=java}UnsupportedPackageCount": 19,
      "{Language=java}UnsupportedPackageVersionCount": 948,
      "{Language=java}UnsupportedSubmoduleCount": 2215,
      "{Language=python}CorruptAssemblyMajorVersionCount": 0,
      "{Language=python}CorruptAssemblyPackageCount": 0,
      "{Language=python}CorruptAssemblyPackageVersionCount": 0,
      "{Language=python}CorruptAssemblySubmoduleCount": 0,
      "{Language=python}MissingMajorVersionCount": 0,
      "{Language=python}MissingPackageCount": 0,
      "{Language=python}MissingPackageVersionCount": 0,
      "{Language=python}MissingSubmoduleCount": 0,
      "{Language=python}SupportedMajorVersionCount": 11,
      "{Language=python}SupportedPackageCount": 10,
      "{Language=python}SupportedPackageVersionCount": 579,
      "{Language=python}SupportedSubmoduleCount": 2204,
      "{Language=python}UnsupportedMajorVersionCount": 20,
      "{Language=python}UnsupportedPackageCount": 19,
      "{Language=python}UnsupportedPackageVersionCount": 667,
      "{Language=python}UnsupportedSubmoduleCount": 1151,
      "{Language=typescript}CorruptAssemblyMajorVersionCount": 0,
      "{Language=typescript}CorruptAssemblyPackageCount": 0,
      "{Language=typescript}CorruptAssemblyPackageVersionCount": 0,
      "{Language=typescript}CorruptAssemblySubmoduleCount": 0,
      "{Language=typescript}MissingMajorVersionCount": 0,
      "{Language=typescript}MissingPackageCount": 0,
      "{Language=typescript}MissingPackageVersionCount": 5,
      "{Language=typescript}MissingSubmoduleCount": 1,
      "{Language=typescript}SupportedMajorVersionCount": 20,
      "{Language=typescript}SupportedPackageCount": 19,
      "{Language=typescript}SupportedPackageVersionCount": 948,
      "{Language=typescript}SupportedSubmoduleCount": 2214,
      "{Language=typescript}UnsupportedMajorVersionCount": 0,
      "{Language=typescript}UnsupportedPackageCount": 0,
      "{Language=typescript}UnsupportedPackageVersionCount": 0,
      "{Language=typescript}UnsupportedSubmoduleCount": 0,
    }
  `);
});

type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Replace HyperLogLog in a structure so we can compare it using Jest's 'expect'
 */
function replaceHyperLogLog(x: any): any {
  if (isHyperLogLog(x)) {
    return x.M;
  }

  if (Array.isArray(x)) {
    return x.map(replaceHyperLogLog);
  }

  if (x && typeof x === 'object') {
    return Object.fromEntries(
      Object.entries(x).map(([key, value]) => [key, replaceHyperLogLog(value)])
    );
  }

  return x;
}

class FakeInventoryHost implements IInventoryHost {
  public readonly reports: Record<string, string[]> = {};
  public readonly metrics: Record<string, number> = {};

  private readonly progresses = new Array<InventoryCanaryState>();
  private pageSize = 1000;

  constructor(private readonly keys: string[]) {}

  public log(...xs: any[]): void {
    Array.isArray(xs);
  }

  loadProgress(continuationObjectKey: string): Promise<InventoryCanaryState> {
    return Promise.resolve(
      this.progresses[parseInt(continuationObjectKey, 10)]
    );
  }

  saveProgress(state: InventoryCanaryState): Promise<InventoryCanaryEvent> {
    this.progresses.push(state);
    return Promise.resolve({
      continuationObjectKey: `${this.progresses.length - 1}`,
    });
  }

  queueReport(reportKey: string, packageVersions: string[]): void {
    this.reports[reportKey] = packageVersions;
  }

  uploadsComplete(): Promise<void> {
    return Promise.resolve();
  }

  public async *relevantObjectKeys(
    continuationToken?: string | undefined
  ): AsyncGenerator<[string[], string | undefined], void, void> {
    let start = parseInt(continuationToken ?? '0', 10);

    while (start < this.keys.length) {
      let end = start + this.pageSize;

      const nextKey = end < this.keys.length ? `${end}` : undefined;
      yield [this.keys.slice(start, end), nextKey];
      start = end;
    }
  }

  timeToCheckpoint(): boolean {
    return Math.random() < 0.5;
  }

  public async metricScope(
    block: (m: IMetrics) => Promise<void>
  ): Promise<void> {
    const collectedMetrics: Record<string, number> = {};
    let dimensions: Record<string, string> = {};

    await block({
      putMetric(key, value) {
        collectedMetrics[key] = value;
        return this;
      },
      setDimensions(dims) {
        dimensions = dims;
        return this;
      },
    });

    let dimPrefix = Object.entries(dimensions)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
    for (const [metricName, metricValue] of Object.entries(collectedMetrics)) {
      const fullName = dimPrefix ? `{${dimPrefix}}${metricName}` : metricName;

      if (
        typeof metricValue !== 'number' ||
        Math.floor(metricValue) !== metricValue
      ) {
        throw new Error(`Expecting int, got ${metricName}: ${metricValue}`);
      }

      this.metrics[fullName] = metricValue;
    }
  }
}
