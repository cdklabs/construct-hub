import * as spec from '@jsii/spec';

import * as AWS from 'aws-sdk';
import type { AWSError } from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import { LanguageNotSupportedError, Language } from 'jsii-docgen';

// this import is separate from the normal because we want jest to mock it.
import { Documentation } from 'jsii-docgen/lib/docgen/view/documentation';

import type { TransliteratorInput } from '../../../backend/payload-schema';
import { reset } from '../../../backend/shared/aws.lambda-shared';
import * as constants from '../../../backend/shared/constants';
import { DocumentationLanguage } from '../../../backend/shared/language';
import { handler } from '../../../backend/transliterator/transliterator.ecstask';
import { writeFile } from '../../../backend/transliterator/util';

// looks like we are just over the default limit now
jest.setTimeout(6000);

// we only need to mock the `Documentation` class.
jest.mock('jsii-docgen/lib/docgen/view/documentation');
jest.mock('../../../backend/shared/code-artifact.lambda-shared');
jest.mock('../../../backend/shared/shell-out.lambda-shared');
jest.mock('../../../backend/transliterator/util');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockWriteFile = require('../../../backend/transliterator/util').writeFile as jest.MockedFunction<typeof writeFile>;
mockWriteFile.mockImplementation(async (filePath: string) => {
  expect(filePath.endsWith('package.tgz')).toEqual(true);
  return Promise.resolve();
});

type Response<T> = (err: AWS.AWSError | null, data?: T) => void;

beforeEach((done) => {
  AWSMock.setSDKInstance(AWS);
  done();
});

afterEach((done) => {
  AWSMock.restore();
  reset();
  done();
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
    const forPackage = require('jsii-docgen').Documentation.forPackage as jest.MockedFunction<typeof Documentation.forPackage>;

    class MockDocumentation {
      public async render(options: any) {
        if (![Language.PYTHON, Language.TYPESCRIPT].includes(options.language)) {
          throw new LanguageNotSupportedError();
        } else {
          return {
            render: () => 'docs',
          };
        }
      }
    }

    forPackage.mockImplementation(async (_: string) => {
      return new MockDocumentation() as unknown as Documentation;
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

    // mock the s3ObjectExists call
    mockHeadRequest('package.tgz');

    // mock the assembly and tarball requests
    mockFetchRequests(assembly, Buffer.from('fake-tarball', 'utf8'));

    // mock the file uploads
    mockPutDocs(...DocumentationLanguage.ALL.map(
      (lang) =>
        `/docs-${lang}.md${lang === DocumentationLanguage.PYTHON || lang === DocumentationLanguage.TYPESCRIPT ? '' : constants.NOT_SUPPORTED_SUFFIX}`,
    ));

    const created = await handler(event);
    for (const lang of DocumentationLanguage.ALL) {
      const suffix = lang === DocumentationLanguage.PYTHON || lang === DocumentationLanguage.TYPESCRIPT
        ? ''
        : constants.NOT_SUPPORTED_SUFFIX;
      expect(created.map((c) => c.key))
        .toContain(`data/@${packageScope}/${packageName}/v${packageVersion}/docs-${lang}.md${suffix}`);
    }
    expect(created.length).toEqual(DocumentationLanguage.ALL.length);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('../../../backend/shared/code-artifact.lambda-shared').logInWithCodeArtifact).toHaveBeenCalledWith({
      endpoint,
      domain,
      domainOwner,
      apiEndpoint,
    });
  });
});

test('uploads a file per language (scoped package)', async () => {

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const forPackage = require('jsii-docgen').Documentation.forPackage as jest.MockedFunction<typeof Documentation.forPackage>;
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

  // mock the s3ObjectExists call
  mockHeadRequest('package.tgz');

  // mock the assembly and tarball requests
  mockFetchRequests(assembly, Buffer.from('fake-tarball', 'utf8'));

  // mock the file uploads
  mockPutDocs('/docs-typescript.md');

  const created = await handler(event);
  expect(created.length).toEqual(1);
  expect(created[0].key).toEqual(`data/@${packageScope}/${packageName}/v${packageVersion}/docs-typescript.md`);

});

test('uploads a file per submodule (unscoped package)', async () => {

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const forPackage = require('jsii-docgen').Documentation.forPackage as jest.MockedFunction<typeof Documentation.forPackage>;
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
    submodules: { '@scope/package-name.sub1': {}, '@scope/package-name.sub2': {} },
  } as any;

  // mock the s3ObjectExists call
  mockHeadRequest('package.tgz');

  // mock the assembly and tarball requests
  mockFetchRequests(assembly, Buffer.from('fake-tarball', 'utf8'));

  // mock the file uploads
  mockPutDocs(
    '/docs-typescript.md',
    '/docs-sub1-typescript.md',
    '/docs-sub2-typescript.md',
  );

  const created = await handler(event);

  expect(created.map(({ key }) => key)).toEqual([
    `data/${packageName}/v${packageVersion}/docs-typescript.md`,
    `data/${packageName}/v${packageVersion}/docs-sub1-typescript.md`,
    `data/${packageName}/v${packageVersion}/docs-sub2-typescript.md`,
  ]);

});

describe('markers for un-supported languages', () => {
  test('uploads ".not-supported" markers as relevant', async () => {

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const forPackage = require('jsii-docgen').Documentation.forPackage as jest.MockedFunction<typeof Documentation.forPackage>;

    class MockDocumentation {
      public async render() {
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

    // mock the s3ObjectExists call
    mockHeadRequest('package.tgz');

    // mock the assembly and tarball requests
    mockFetchRequests(assembly, Buffer.from('fake-tarball', 'utf8'));

    // mock the file uploads
    mockPutDocs(
      `/docs-python.md${constants.NOT_SUPPORTED_SUFFIX}`,
      `/docs-sub1-python.md${constants.NOT_SUPPORTED_SUFFIX}`,
      `/docs-sub2-python.md${constants.NOT_SUPPORTED_SUFFIX}`,
    );

    const created = await handler(event);

    expect(created.map(({ key }) => key)).toEqual([
      `data/${packageName}/v${packageVersion}/docs-python.md${constants.NOT_SUPPORTED_SUFFIX}`,
      `data/${packageName}/v${packageVersion}/docs-sub1-python.md${constants.NOT_SUPPORTED_SUFFIX}`,
      `data/${packageName}/v${packageVersion}/docs-sub2-python.md${constants.NOT_SUPPORTED_SUFFIX}`,
    ]);

  });
});

class MockDocumentation {
  public constructor(private readonly target: string) {}
  public async render() {
    return {
      render: () => `docs for ${this.target}`,
    };
  }
}

function mockFetchRequests(assembly: spec.Assembly, tarball: Buffer) {
  AWSMock.mock('S3', 'getObject', (request: AWS.S3.GetObjectRequest, callback: Response<AWS.S3.GetObjectOutput>) => {
    if (request.Key.endsWith(constants.ASSEMBLY_KEY_SUFFIX)) {
      callback(null, {
        Body: JSON.stringify(assembly),
      });
    } else if (request.Key.endsWith(constants.PACKAGE_KEY_SUFFIX)) {
      callback(null, {
        Body: JSON.stringify(tarball),
      });
    } else {
      throw new Error(`Unexpected GET request: ${request.Key}`);
    }
  });
}

function mockHeadRequest(key: string) {
  AWSMock.mock('S3', 'headObject', (req: AWS.S3.HeadObjectRequest, cb: Response<AWS.S3.HeadObjectOutput>) => {
    if (req.Key.endsWith(key)) {
      return cb(null, {});
    }
    class NotFound extends Error implements AWSError {
      public code = 'NotFound';
      public message = 'Not Found';
      public time = new Date();
    }
    return cb(new NotFound());
  });
}

function mockPutDocs(...suffixes: string[]) {

  AWSMock.mock('S3', 'putObject', (request: AWS.S3.PutObjectRequest, callback: Response<AWS.S3.PutObjectOutput>) => {
    if (suffixes.filter(s => request.Key.endsWith(s)).length > 0) {
      callback(null, { VersionId: `versionId-${request.Key}` });
    } else {
      throw new Error(`Unexpected PUT request: ${request.Key}`);
    }
  });

}
