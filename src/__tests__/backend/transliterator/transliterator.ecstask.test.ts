import * as spec from '@jsii/spec';

import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import { Documentation } from 'jsii-docgen';

import type { TransliteratorInput } from '../../../backend/payload-schema';
import { reset } from '../../../backend/shared/aws.lambda-shared';
import * as constants from '../../../backend/shared/constants';
import type { extractObjects } from '../../../backend/shared/tarball.lambda-shared';
import { handler } from '../../../backend/transliterator/transliterator.ecstask';

jest.mock('child_process');
jest.mock('jsii-docgen');
jest.mock('../../../backend/shared/code-artifact.lambda-shared');
jest.mock('../../../backend/shared/tarball.lambda-shared');

type Response<T> = (err: AWS.AWSError | null, data?: T) => void;

beforeEach((done) => {
  AWSMock.setSDKInstance(AWS);
  process.env.TARGET_LANGUAGE = 'typescript';
  done();
});

afterEach((done) => {
  AWSMock.restore();
  delete process.env.TARGET_LANGUAGE;
  reset();
  done();
});

const packageJson: any = {
  dependencies: {
    foo: '^1.2.3',
  },
  devDependencies: {
    bar: '^1.2.3',
  },
};

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
    forPackage.mockImplementation(async (target: string) => {
      return new MockDocumentation(target) as unknown as Documentation;
    });

    // mock extracting the package.json from the tarball
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mockExtractObjects = require('../../../backend/shared/tarball.lambda-shared').extractObjects as jest.MockedFunction<typeof extractObjects>;
    mockExtractObjects.mockResolvedValue({ packageJson: Buffer.from(JSON.stringify(packageJson), 'utf8') });

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

    // mock the file uploads
    mockPutDocs('/docs-typescript.md');

    const created = await handler(event);
    expect(created.length).toEqual(1);
    expect(created[0].key).toEqual(`data/@${packageScope}/${packageName}/v${packageVersion}/docs-typescript.md`);
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

  // mock extracting the package.json from the tarball
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockExtractObjects = require('../../../backend/shared/tarball.lambda-shared').extractObjects as jest.MockedFunction<typeof extractObjects>;
  mockExtractObjects.mockResolvedValue({ packageJson: Buffer.from(JSON.stringify(packageJson), 'utf8') });

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

  // mock extracting the package.json from the tarball
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockExtractObjects = require('../../../backend/shared/tarball.lambda-shared').extractObjects as jest.MockedFunction<typeof extractObjects>;
  mockExtractObjects.mockResolvedValue({ packageJson: Buffer.from(JSON.stringify(packageJson), 'utf8') });

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
  };

  const assembly: spec.Assembly = {
    targets: { python: {} },
    submodules: { '@scope/package-name.sub1': {}, '@scope/package-name.sub2': {} },
  } as any;

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
  beforeEach((done) => {
    // Switch language, as TypeScript is always supported 🙃
    process.env.TARGET_LANGUAGE = 'python';
    done();
  });

  afterEach((done) => {
    delete process.env.TARGET_LANGUAGE;
    done();
  });

  test('uploads ".not-supported" markers as relevant', async () => {

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const forPackage = require('jsii-docgen').Documentation.forPackage as jest.MockedFunction<typeof Documentation.forPackage>;
    forPackage.mockImplementation(async (target: string) => {
      return new MockDocumentation(target) as unknown as Documentation;
    });

    // mock extracting the package.json from the tarball
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mockExtractObjects = require('../../../backend/shared/tarball.lambda-shared').extractObjects as jest.MockedFunction<typeof extractObjects>;
    mockExtractObjects.mockResolvedValue({ packageJson: Buffer.from(JSON.stringify(packageJson), 'utf8') });

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
    };

    const assembly: spec.Assembly = {
      targets: { phony: {} },
      submodules: { 'package-name.sub1': {}, 'package-name.sub2': {} },
    } as any;

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
  public render() {
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

function mockPutDocs(...suffixes: string[]) {

  AWSMock.mock('S3', 'putObject', (request: AWS.S3.PutObjectRequest, callback: Response<AWS.S3.PutObjectOutput>) => {
    if (suffixes.filter(s => request.Key.endsWith(s)).length > 0) {
      callback(null, { VersionId: `versionId-${request.Key}` });
    } else {
      throw new Error(`Unexpected PUT request: ${request.Key}`);
    }
  });

}

