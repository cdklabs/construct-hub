import * as spec from '@jsii/spec';

import type { S3Event } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import { Documentation } from 'jsii-docgen';

import * as constants from '../../../backend/shared/constants';
import { handler, reset } from '../../../backend/transliterator/transliterator.lambda';

type Response<T> = (err: AWS.AWSError | null, data?: T) => void;

jest.mock('jsii-docgen');

beforeEach((done) => {
  AWSMock.setSDKInstance(AWS);
  done();
});

afterEach((done) => {
  AWSMock.restore();
  reset();
  done();
});

test('uploads a file per language', async () => {

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const forPackage = require('jsii-docgen').Documentation.forPackage as jest.MockedFunction<typeof Documentation.forPackage>;
  forPackage.mockImplementation(async (target: string) => {
    return new MockDocumentation(target) as unknown as Documentation;
  });

  // GIVEN
  const packageScope = 'scope';
  const packageName = 'package-name';
  const packageVersion = '1.2.3-dev.4';
  const event: S3Event = {
    Records: [{
      awsRegion: 'bemuda-triangle-1',
      s3: {
        bucket: {
          name: 'dummy-bucket',
        },
        object: {
          key: `${constants.STORAGE_KEY_PREFIX}%40${packageScope}/${packageName}/v${packageVersion}${constants.ASSEMBLY_KEY_SUFFIX}`,
          versionId: 'VersionId',
        },
      },
    }],
  } as any;

  const assembly: spec.Assembly = {
    targets: { python: {} },
  } as any;

  // mock the assembly request
  mockFetchAssembly(assembly);

  // mock the file uploads
  mockPutDocs('/docs-python.md', '/docs-typescript.md');

  const created = await handler(event, {} as any);
  expect(created.length).toEqual(2);
  expect(created[0].key).toEqual(`data/@${packageScope}/${packageName}/v${packageVersion}/docs-python.md`);
  expect(created[1].key).toEqual(`data/@${packageScope}/${packageName}/v${packageVersion}/docs-typescript.md`);

});

test('uploads a file per submodule', async () => {

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const forPackage = require('jsii-docgen').Documentation.forPackage as jest.MockedFunction<typeof Documentation.forPackage>;
  forPackage.mockImplementation(async (target: string) => {
    return new MockDocumentation(target) as unknown as Documentation;
  });

  // GIVEN
  const packageScope = 'scope';
  const packageName = 'package-name';
  const packageVersion = '1.2.3-dev.4';
  const event: S3Event = {
    Records: [{
      awsRegion: 'bemuda-triangle-1',
      s3: {
        bucket: {
          name: 'dummy-bucket',
        },
        object: {
          key: `${constants.STORAGE_KEY_PREFIX}%40${packageScope}/${packageName}/v${packageVersion}${constants.ASSEMBLY_KEY_SUFFIX}`,
          versionId: 'VersionId',
        },
      },
    }],
  } as any;

  const assembly: spec.Assembly = {
    targets: { python: {} },
    submodules: { '@scope/package-name.sub1': {}, '@scope/package-name.sub2': {} },
  } as any;

  // mock the assembly request
  mockFetchAssembly(assembly);

  // mock the file uploads
  mockPutDocs(
    '/docs-python.md',
    '/docs-sub1-python.md',
    '/docs-sub2-python.md',
    '/docs-typescript.md',
    '/docs-sub1-typescript.md',
    '/docs-sub2-typescript.md',
  );

  const created = await handler(event, {} as any);
  expect(created.length).toEqual(6);
  expect(created[0].key).toEqual(`data/@${packageScope}/${packageName}/v${packageVersion}/docs-python.md`);
  expect(created[1].key).toEqual(`data/@${packageScope}/${packageName}/v${packageVersion}/docs-sub1-python.md`);
  expect(created[2].key).toEqual(`data/@${packageScope}/${packageName}/v${packageVersion}/docs-sub2-python.md`);
  expect(created[3].key).toEqual(`data/@${packageScope}/${packageName}/v${packageVersion}/docs-typescript.md`);
  expect(created[4].key).toEqual(`data/@${packageScope}/${packageName}/v${packageVersion}/docs-sub1-typescript.md`);
  expect(created[5].key).toEqual(`data/@${packageScope}/${packageName}/v${packageVersion}/docs-sub2-typescript.md`);

});

class MockDocumentation {
  public constructor(private readonly target: string) {}
  public render() {
    return {
      render: () => `docs for ${this.target}`,
    };
  }
}

function mockFetchAssembly(response: spec.Assembly) {
  AWSMock.mock('S3', 'getObject', (request: AWS.S3.GetObjectRequest, callback: Response<AWS.S3.GetObjectOutput>) => {
    if (request.Key.endsWith(constants.ASSEMBLY_KEY_SUFFIX)) {
      callback(null, {
        Body: JSON.stringify(response),
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

