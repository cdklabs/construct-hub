import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import * as spec from '@jsii/spec';
import { sdkStreamMixin } from '@smithy/util-stream';
import { mockClient } from 'aws-sdk-client-mock';
import {
  LanguageNotSupportedError,
  UnInstallablePackageError,
  CorruptedAssemblyError,
  Language,
} from 'jsii-docgen';

// this import is separate from the normal because we want jest to mock it.
import { MarkdownDocument } from 'jsii-docgen/lib/docgen/render/markdown-doc';
import { MarkdownRenderer } from 'jsii-docgen/lib/docgen/render/markdown-render';
import { Documentation } from 'jsii-docgen/lib/docgen/view/documentation';

import type { TransliteratorInput } from '../../../backend/payload-schema';
import * as constants from '../../../backend/shared/constants';
import { DocumentationLanguage } from '../../../backend/shared/language';
import {
  transliterate,
  handler,
} from '../../../backend/transliterator/transliterator.ecstask';
import { writeFile } from '../../../backend/transliterator/util';

// looks like we are just over the default limit now
jest.setTimeout(60_000);

jest.mock('jsii-docgen/lib/docgen/render/markdown-render');
jest.mock('jsii-docgen/lib/docgen/view/documentation');
jest.mock('../../../backend/shared/code-artifact.lambda-shared');
jest.mock('../../../backend/shared/shell-out.lambda-shared');
jest.mock('../../../backend/transliterator/util');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockWriteFile = require('../../../backend/transliterator/util')
  .writeFile as jest.MockedFunction<typeof writeFile>;
mockWriteFile.mockImplementation(async (filePath: string) => {
  expect(filePath.endsWith('package.tgz')).toEqual(true);
  return Promise.resolve();
});

const mockS3 = mockClient(S3Client);

beforeEach(() => {
  mockS3.reset();
});

describe('VPC Endpoints', () => {
  const previousEnv = process.env;
  const endpoint = 'codeartifact.d.bermuda-triangle-1.amazonaws.com';
  const apiEndpoint = 'codeartifact.api.bermuda-triangle-1.amazonaws.com';
  const domain = 'domain-name';
  const domainOwner = '123456789012';

  beforeAll(() => {
    process.env = {
      ...previousEnv,
      CODE_ARTIFACT_REPOSITORY_ENDPOINT: endpoint,
      CODE_ARTIFACT_DOMAIN_NAME: domain,
      CODE_ARTIFACT_DOMAIN_OWNER: domainOwner,
      CODE_ARTIFACT_API_ENDPOINT: apiEndpoint,
    };
  });

  afterAll(() => {
    process.env = { ...previousEnv };
  });

  test('happy path', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const forPackage = require('jsii-docgen').Documentation
      .forPackage as jest.MockedFunction<typeof Documentation.forPackage>;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fromSchema = require('jsii-docgen').MarkdownRenderer
      .fromSchema as jest.MockedFunction<typeof MarkdownRenderer.fromSchema>;

    class MockDocumentation {
      public async toJson(options: any) {
        if (
          ![Language.PYTHON, Language.TYPESCRIPT].includes(options.language)
        ) {
          throw new LanguageNotSupportedError();
        } else {
          return {
            render: () => '{ "contents": "docs" }',
          };
        }
      }
    }

    forPackage.mockImplementation(async (_: string) => {
      return new MockDocumentation() as unknown as Documentation;
    });
    fromSchema.mockImplementation((_schema, _options) => {
      return new MarkdownDocument();
    });

    // GIVEN
    const packageScope = 'scope';
    const packageName = 'package-name';
    const packageVersion = '1.2.3-dev.4';
    const event: TransliteratorInput = {
      bucket: 'dummy-bucket',
      assembly: {
        key: `${constants.STORAGE_KEY_PREFIX}@${packageScope}/${packageName}/v${packageVersion}${constants.ASSEMBLY_KEY_SUFFIX}`,
        versionId: 'VersionId',
      },
      package: {
        key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.PACKAGE_KEY_SUFFIX}`,
        versionId: 'VersionId',
      },
    };

    const assembly: spec.Assembly = {
      targets: { python: {} },
    } as any;

    // mock the assembly and tarball requests
    mockFetchRequests(assembly, Buffer.from('fake-tarball', 'utf8'));

    // nothing to delete
    mockDeleteRequest();

    // mock the file uploads
    mockPutRequest(
      ...DocumentationLanguage.ALL.map(
        (lang) =>
          `/docs-${lang}.md${
            lang === DocumentationLanguage.PYTHON ||
            lang === DocumentationLanguage.TYPESCRIPT
              ? ''
              : constants.NOT_SUPPORTED_SUFFIX
          }`
      ),
      ...DocumentationLanguage.ALL.map(
        (lang) =>
          `/docs-${lang}.json${
            lang === DocumentationLanguage.PYTHON ||
            lang === DocumentationLanguage.TYPESCRIPT
              ? ''
              : constants.NOT_SUPPORTED_SUFFIX
          }`
      )
    );

    const { created } = await transliterate(event);
    for (const lang of DocumentationLanguage.ALL) {
      const suffix =
        lang === DocumentationLanguage.PYTHON ||
        lang === DocumentationLanguage.TYPESCRIPT
          ? ''
          : constants.NOT_SUPPORTED_SUFFIX;
      expect(created.map((c) => c)).toContain(
        `data/@${packageScope}/${packageName}/v${packageVersion}/docs-${lang}.md${suffix}`
      );
      expect(created.map((c) => c)).toContain(
        `data/@${packageScope}/${packageName}/v${packageVersion}/docs-${lang}.json${suffix}`
      );
    }
    expect(created.length).toEqual(DocumentationLanguage.ALL.length * 2); // one .md and one .json per language
    expect(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../../backend/shared/code-artifact.lambda-shared')
        .logInWithCodeArtifact
    ).toHaveBeenCalledWith({
      endpoint,
      domain,
      domainOwner,
      apiEndpoint,
    });
  });
});

test('uninstallable package marker is uploaded', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const forPackage = require('jsii-docgen').Documentation
    .forPackage as jest.MockedFunction<typeof Documentation.forPackage>;
  forPackage.mockImplementation(async (_: string) => {
    throw new UnInstallablePackageError();
  });

  const packageName = 'package-name';
  const packageVersion = '1.2.3-dev.4';

  const event: TransliteratorInput = {
    bucket: 'dummy-bucket',
    assembly: {
      key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.ASSEMBLY_KEY_SUFFIX}`,
      versionId: 'VersionId',
    },
    package: {
      key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.PACKAGE_KEY_SUFFIX}`,
      versionId: 'VersionId',
    },
  };

  const assembly: spec.Assembly = {
    targets: { python: {} },
  } as any;

  // mock the assembly and tarball requests
  mockFetchRequests(assembly, Buffer.from('fake-tarball', 'utf8'));

  // nothing to delete
  mockDeleteRequest();

  mockPutRequest('/uninstallable');

  const { created } = await transliterate(event);
  expect(created.length).toEqual(1);
  expect(created[0]).toEqual(
    `data/${packageName}/v${packageVersion}/uninstallable`
  );
});

test('corrupt assembly marker is uploaded for the necessary languages', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const forPackage = require('jsii-docgen').Documentation
    .forPackage as jest.MockedFunction<typeof Documentation.forPackage>;

  class MockDocumentation {
    public async toJson() {
      throw new CorruptedAssemblyError();
    }
  }

  forPackage.mockImplementation(async (_: string) => {
    return new MockDocumentation() as unknown as Documentation;
  });

  const packageName = 'package-name';
  const packageVersion = '1.2.3-dev.4';

  const event: TransliteratorInput = {
    bucket: 'dummy-bucket',
    assembly: {
      key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.ASSEMBLY_KEY_SUFFIX}`,
      versionId: 'VersionId',
    },
    package: {
      key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.PACKAGE_KEY_SUFFIX}`,
      versionId: 'VersionId',
    },
    languages: { typescript: true, python: true },
  };

  const assembly: spec.Assembly = {} as any;

  // mock the assembly and tarball requests
  mockFetchRequests(assembly, Buffer.from('fake-tarball', 'utf8'));

  // nothing to delete
  mockDeleteRequest();

  mockPutRequest(constants.CORRUPT_ASSEMBLY_SUFFIX);

  const { created } = await transliterate(event);
  expect(created.length).toEqual(4);
  expect(created[0]).toEqual(
    `data/${packageName}/v${packageVersion}/docs-typescript.json${constants.CORRUPT_ASSEMBLY_SUFFIX}`
  );
  expect(created[1]).toEqual(
    `data/${packageName}/v${packageVersion}/docs-typescript.md${constants.CORRUPT_ASSEMBLY_SUFFIX}`
  );
  expect(created[2]).toEqual(
    `data/${packageName}/v${packageVersion}/docs-python.json${constants.CORRUPT_ASSEMBLY_SUFFIX}`
  );
  expect(created[3]).toEqual(
    `data/${packageName}/v${packageVersion}/docs-python.md${constants.CORRUPT_ASSEMBLY_SUFFIX}`
  );
});

test('corrupt assembly and uninstallable markers are deleted', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const forPackage = require('jsii-docgen').Documentation
    .forPackage as jest.MockedFunction<typeof Documentation.forPackage>;

  class MockDocumentation {
    public async toJson() {
      return new MarkdownDocument();
    }
  }

  forPackage.mockImplementation(async (_: string) => {
    return new MockDocumentation() as unknown as Documentation;
  });

  const packageName = 'package-name';
  const packageVersion = '1.2.3-dev.4';

  const event: TransliteratorInput = {
    bucket: 'dummy-bucket',
    assembly: {
      key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.ASSEMBLY_KEY_SUFFIX}`,
      versionId: 'VersionId',
    },
    package: {
      key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.PACKAGE_KEY_SUFFIX}`,
      versionId: 'VersionId',
    },
    languages: { typescript: true },
  };

  const assembly: spec.Assembly = {} as any;

  // mock the assembly and tarball requests
  mockFetchRequests(assembly, Buffer.from('fake-tarball', 'utf8'));

  mockPutRequest('/docs-typescript.json', '/docs-typescript.md');
  mockDeleteRequest(
    constants.CORRUPT_ASSEMBLY_SUFFIX,
    constants.UNINSTALLABLE_PACKAGE_SUFFIX
  );

  const { created, deleted } = await transliterate(event);
  expect(created.length).toEqual(2);
  expect(deleted.length).toEqual(2);
  expect(created[0]).toEqual(
    `data/${packageName}/v${packageVersion}/docs-typescript.json`
  );
  expect(created[1]).toEqual(
    `data/${packageName}/v${packageVersion}/docs-typescript.md`
  );
  expect(deleted[0]).toEqual(
    `data/${packageName}/v${packageVersion}${constants.UNINSTALLABLE_PACKAGE_SUFFIX}`
  );
  expect(deleted[1]).toEqual(
    `data/${packageName}/v${packageVersion}/docs-typescript.md${constants.CORRUPT_ASSEMBLY_SUFFIX}`
  );
});

test('uploads a file per language (scoped package)', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const forPackage = require('jsii-docgen').Documentation
    .forPackage as jest.MockedFunction<typeof Documentation.forPackage>;
  forPackage.mockImplementation(async (target: string) => {
    return new MockDocumentation(target) as unknown as Documentation;
  });

  // GIVEN
  const packageScope = 'scope';
  const packageName = 'package-name';
  const packageVersion = '1.2.3-dev.4';
  const event: TransliteratorInput = {
    bucket: 'dummy-bucket',
    assembly: {
      key: `${constants.STORAGE_KEY_PREFIX}@${packageScope}/${packageName}/v${packageVersion}${constants.ASSEMBLY_KEY_SUFFIX}`,
      versionId: 'VersionId',
    },
    package: {
      key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.PACKAGE_KEY_SUFFIX}`,
      versionId: 'VersionId',
    },
    languages: { typescript: true },
  };

  const assembly: spec.Assembly = {
    targets: { python: {} },
  } as any;

  // mock the assembly and tarball requests
  mockFetchRequests(assembly, Buffer.from('fake-tarball', 'utf8'));

  // nothing to delete
  mockDeleteRequest();

  // mock the file uploads
  mockPutRequest('/docs-typescript.json', '/docs-typescript.md');

  const { created } = await transliterate(event);
  expect(created.length).toEqual(2);
  expect(created[0]).toEqual(
    `data/@${packageScope}/${packageName}/v${packageVersion}/docs-typescript.json`
  );
  expect(created[1]).toEqual(
    `data/@${packageScope}/${packageName}/v${packageVersion}/docs-typescript.md`
  );
});

test('uploads a file per submodule (unscoped package)', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const forPackage = require('jsii-docgen').Documentation
    .forPackage as jest.MockedFunction<typeof Documentation.forPackage>;
  forPackage.mockImplementation(async (target: string) => {
    return new MockDocumentation(target) as unknown as Documentation;
  });

  // GIVEN
  const packageName = 'package-name';
  const packageVersion = '1.2.3-dev.4';
  const event: TransliteratorInput = {
    bucket: 'dummy-bucket',
    assembly: {
      key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.ASSEMBLY_KEY_SUFFIX}`,
      versionId: 'VersionId',
    },
    package: {
      key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.PACKAGE_KEY_SUFFIX}`,
      versionId: 'VersionId',
    },
    languages: { typescript: true },
  };

  const assembly: spec.Assembly = {
    targets: { python: {} },
    submodules: {
      '@scope/package-name.sub1': {},
      '@scope/package-name.sub2': {},
      '@scope/package-name.sub2.nested': {},
    },
  } as any;

  // mock the assembly and tarball requests
  mockFetchRequests(assembly, Buffer.from('fake-tarball', 'utf8'));

  // nothing to delete
  mockDeleteRequest();

  // mock the file uploads
  mockPutRequest(
    '/docs-typescript.md',
    '/docs-sub1-typescript.md',
    '/docs-sub2-typescript.md',
    '/docs-sub2.nested-typescript.md',
    '/docs-typescript.json',
    '/docs-sub1-typescript.json',
    '/docs-sub2-typescript.json',
    '/docs-sub2.nested-typescript.json'
  );

  const { created } = await transliterate(event);

  expect(created).toEqual([
    `data/${packageName}/v${packageVersion}/docs-typescript.json`,
    `data/${packageName}/v${packageVersion}/docs-typescript.md`,
    `data/${packageName}/v${packageVersion}/docs-sub1-typescript.json`,
    `data/${packageName}/v${packageVersion}/docs-sub1-typescript.md`,
    `data/${packageName}/v${packageVersion}/docs-sub2-typescript.json`,
    `data/${packageName}/v${packageVersion}/docs-sub2-typescript.md`,
    `data/${packageName}/v${packageVersion}/docs-sub2.nested-typescript.json`,
    `data/${packageName}/v${packageVersion}/docs-sub2.nested-typescript.md`,
  ]);
});

test.each([true, false])(
  'will not return a response that is too large: %p',
  async (explicitLanguages) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const forPackage = require('jsii-docgen').Documentation
      .forPackage as jest.MockedFunction<typeof Documentation.forPackage>;
    forPackage.mockImplementation(async (target: string) => {
      return new MockDocumentation(target) as unknown as Documentation;
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fromSchema = require('jsii-docgen').MarkdownRenderer
      .fromSchema as jest.MockedFunction<typeof MarkdownRenderer.fromSchema>;
    fromSchema.mockImplementation((_schema, _options) => {
      return new MarkdownDocument();
    });

    // GIVEN
    const packageName = '@scope/package-with-a-pretty-long-name';
    const packageVersion = '1.2.3-dev.4';
    const event: TransliteratorInput = {
      bucket: 'dummy-bucket',
      assembly: {
        key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.ASSEMBLY_KEY_SUFFIX}`,
        versionId: 'VersionId',
      },
      package: {
        key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.PACKAGE_KEY_SUFFIX}`,
        versionId: 'VersionId',
      },
      ...(explicitLanguages ? { languages: { typescript: true } } : {}),
    };

    const assembly: spec.Assembly = {
      targets: { python: {} },
      submodules: Object.fromEntries(
        range(1000).map((i) => [`${packageName}.sub${i}`, {}])
      ),
    } as any;

    // mock the assembly and tarball requests
    mockFetchRequests(assembly, Buffer.from('fake-tarball', 'utf8'));

    // mock the file uploads
    const writtenKeys = mockPutRequestCollectAll();

    // nothing to delete
    mockDeleteRequest();

    // WHEN
    const result = await handler(event);

    // THEN: We didn't write and return all of the requested submodules
    console.log('Uploaded', writtenKeys);
    expect(JSON.stringify(result).length).toBeLessThan(260_000);
  }
);

describe('markers for un-supported languages', () => {
  test('uploads ".not-supported" markers as relevant', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const forPackage = require('jsii-docgen').Documentation
      .forPackage as jest.MockedFunction<typeof Documentation.forPackage>;

    class MockDocumentation {
      public async toJson() {
        throw new LanguageNotSupportedError();
      }
    }

    forPackage.mockImplementation(async (_: string) => {
      return new MockDocumentation() as unknown as Documentation;
    });

    // GIVEN
    const packageName = 'package-name';
    const packageVersion = '1.2.3-dev.4';

    const event: TransliteratorInput = {
      bucket: 'dummy-bucket',
      assembly: {
        key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.ASSEMBLY_KEY_SUFFIX}`,
        versionId: 'VersionId',
      },
      package: {
        key: `${constants.STORAGE_KEY_PREFIX}${packageName}/v${packageVersion}${constants.PACKAGE_KEY_SUFFIX}`,
        versionId: 'VersionId',
      },
      // Only doing Python here...
      languages: { python: true },
    };

    const assembly: spec.Assembly = {
      targets: { phony: {} },
      submodules: { 'package-name.sub1': {}, 'package-name.sub2': {} },
    } as any;

    // mock the assembly and tarball requests
    mockFetchRequests(assembly, Buffer.from('fake-tarball', 'utf8'));

    // mock the file uploads
    mockPutRequest(
      `/docs-python.md${constants.NOT_SUPPORTED_SUFFIX}`,
      `/docs-sub1-python.md${constants.NOT_SUPPORTED_SUFFIX}`,
      `/docs-sub2-python.md${constants.NOT_SUPPORTED_SUFFIX}`,
      `/docs-python.json${constants.NOT_SUPPORTED_SUFFIX}`,
      `/docs-sub1-python.json${constants.NOT_SUPPORTED_SUFFIX}`,
      `/docs-sub2-python.json${constants.NOT_SUPPORTED_SUFFIX}`
    );

    // nothing to delete
    mockDeleteRequest();

    const { created } = await transliterate(event);

    expect(created).toEqual([
      `data/${packageName}/v${packageVersion}/docs-python.json${constants.NOT_SUPPORTED_SUFFIX}`,
      `data/${packageName}/v${packageVersion}/docs-python.md${constants.NOT_SUPPORTED_SUFFIX}`,
      `data/${packageName}/v${packageVersion}/docs-sub1-python.json${constants.NOT_SUPPORTED_SUFFIX}`,
      `data/${packageName}/v${packageVersion}/docs-sub1-python.md${constants.NOT_SUPPORTED_SUFFIX}`,
      `data/${packageName}/v${packageVersion}/docs-sub2-python.json${constants.NOT_SUPPORTED_SUFFIX}`,
      `data/${packageName}/v${packageVersion}/docs-sub2-python.md${constants.NOT_SUPPORTED_SUFFIX}`,
    ]);
  });
});

class MockDocumentation {
  public constructor(private readonly target: string) {}
  public async toJson() {
    return {
      render: () => `{ "content": "docs for ${this.target}" }`,
    };
  }
}

function mockFetchRequests(assembly: spec.Assembly, tarball: Buffer) {
  mockS3.on(GetObjectCommand).callsFake((request) => {
    if (request.Key.endsWith(constants.ASSEMBLY_KEY_SUFFIX)) {
      const stream = new Readable();
      stream.push(JSON.stringify(assembly));
      stream.push(null);
      return {
        Body: sdkStreamMixin(stream),
      };
    } else if (request.Key.endsWith(constants.PACKAGE_KEY_SUFFIX)) {
      const stream = new Readable();
      stream.push(tarball);
      stream.push(null);
      return {
        Body: sdkStreamMixin(stream),
      };
    } else {
      throw new NotFound({
        message: `NotFound GET request: ${request.Key}`,
        $metadata: {},
      });
    }
  });
}

function mockPutRequest(...suffixes: string[]) {
  mockS3.on(PutObjectCommand).callsFake((request) => {
    if (suffixes.filter((s) => request.Key.endsWith(s)).length > 0) {
      return { VersionId: `versionId-${request.Key}` };
    } else {
      throw new Error(`Unexpected PUT request: ${request.Key}`);
    }
  });
}

function mockPutRequestCollectAll() {
  const ret = new Array();
  mockS3.on(PutObjectCommand).callsFake((request) => {
    ret.push(request.Key);
    return { VersionId: `versionId-${request.Key}` };
  });
  return ret;
}

function mockDeleteRequest(...suffixes: string[]) {
  mockS3.on(DeleteObjectCommand).callsFake((request) => {
    if (suffixes.filter((s) => request.Key.endsWith(s)).length > 0) {
      return { VersionId: `versionId-${request.Key}` };
    } else {
      throw new NotFound({
        message: `NotFound DELETE request: ${request.Key}`,
        $metadata: {},
      });
    }
  });
}

function range(n: number): number[] {
  const ret = new Array<number>();
  for (let i = 0; i < n; i++) {
    ret.push(i);
  }
  return ret;
}
