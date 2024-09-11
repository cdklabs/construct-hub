import {
  GetObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { StreamingBlobPayloadOutputTypes } from '@smithy/types';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import * as feed from 'feed';
import { handler } from '../../../backend/feed-builder/update-feed.lambda';
import * as constants from '../../../backend/shared/constants';
import { stringToStream } from '../../streams';

// Hack to spy on methods of es5 class by wrapping the class
jest.mock('feed', () => {
  const originalModule = jest.requireActual('feed');
  const mocks: Record<string, jest.Mock> = {};
  return {
    __esModule: true,
    // hack to expose mock for assertions
    mocks,
    Feed: function (...a: any[]) {
      const feedInst = new originalModule.Feed(...a);
      for (const methodname of Object.getOwnPropertyNames(feedInst)) {
        mocks[methodname] = (this as any)[methodname] = jest
          .fn()
          .mockImplementation((...args) => {
            return feedInst[methodname](...args);
          });
      }
    },
  };
});

const MOCK_CATALOG_BUCKET_NAME = 'package-data-bucket';
const MOCK_CATALOG_OBJECT_KEY = 'catalog.json';
const MOCK_CONTRUCT_HUB_URL = 'https://myconstruct.dev';
const MAX_ENTRIES_IN_FEED = '2';

const packagesInCatalog = ['pkg2@1.24.0', 'pkg3@1.1.1', 'pkg1@0.2.2'];
const packageReleaseDates = [
  '2019-06-19T17:10:16.140Z',
  '2022-10-19T17:10:30.008Z',
  '2018-10-19T17:10:30.008Z',
];
const MOCK_CATALOG = {
  packages: packagesInCatalog.map((pkgName, index) => {
    const [name, version] = pkgName.split('@');
    return {
      author: {
        name: 'Amazon Web Services',
        url: 'https://aws.amazon.com',
        organization: true,
      },
      description: `${pkgName} description`,
      metadata: {
        date: packageReleaseDates[index],
      },
      name,
      version,
    };
  }),
};
const mockS3 = mockClient(S3Client);
const s3ObjectMap: Map<string, StreamingBlobPayloadOutputTypes> = new Map();

beforeEach(() => {
  mockS3.reset();
  process.env.CATALOG_BUCKET_NAME = MOCK_CATALOG_BUCKET_NAME;
  process.env.CATALOG_OBJECT_KEY = MOCK_CATALOG_OBJECT_KEY;
  process.env.FEED_ENTRY_COUNT = MAX_ENTRIES_IN_FEED;
  process.env[constants.CONSTRUCT_HUB_URL_ENV_VAR_NAME] = MOCK_CONTRUCT_HUB_URL;
  s3ObjectMap.clear();
  // Add release-notes
  packagesInCatalog.forEach((pkgName) => {
    const [name, version] = pkgName.split('@');
    const { releaseNotesKey } = constants.getObjectKeys(name, version);
    s3ObjectMap.set(
      releaseNotesKey,
      stringToStream(`Release notes for ${pkgName}`)
    );
  });

  s3ObjectMap.set(
    constants.CATALOG_KEY,
    stringToStream(JSON.stringify(MOCK_CATALOG))
  );

  mockS3.on(GetObjectCommand).callsFake((request) => {
    expect(request.Bucket).toEqual(MOCK_CATALOG_BUCKET_NAME);
    if (s3ObjectMap.has(request.Key)) {
      return { Body: s3ObjectMap.get(request.Key) };
    }

    throw new NotFound({
      message: `NotFound GET request: ${request.Key}`,
      $metadata: {},
    });
  });

  mockS3.on(PutObjectCommand).callsFake((request) => {
    expect(request.Bucket).toEqual(MOCK_CATALOG_BUCKET_NAME);
    if (request.Key === 'atom' || request.Key === 'rss') {
      return {};
    }

    throw new S3ServiceException({
      $metadata: {},
      name: 'NotSaved',
      message: 'NotSaved',
      $fault: 'server',
    });
  });
});

afterEach(() => {
  delete process.env.CATALOG_BUCKET_NAME;
  delete process.env.CATALOG_OBJECT_KEY;
  delete process.env.FEED_ENTRY_COUNT;
  delete process.env[constants.CONSTRUCT_HUB_URL_ENV_VAR_NAME];
});

test(`generate feed latest ${MAX_ENTRIES_IN_FEED} packages`, async () => {
  await handler();
  expect(mockS3).toHaveReceivedCommandTimes(PutObjectCommand, 2);
  expect(mockS3).toHaveReceivedNthSpecificCommandWith(1, PutObjectCommand, {
    Bucket: MOCK_CATALOG_BUCKET_NAME,
    Key: 'atom',
    Body: expect.anything(),
    CacheControl: expect.anything(),
    ContentType: 'application/atom+xml',
  });
  expect(mockS3).toHaveReceivedNthSpecificCommandWith(2, PutObjectCommand, {
    Bucket: MOCK_CATALOG_BUCKET_NAME,
    Key: 'rss',
    Body: expect.anything(),
    CacheControl: expect.anything(),
    ContentType: 'application/xml',
  });

  expect((feed as any).mocks.addItem).toHaveBeenCalledTimes(2);
  const firstCallArgs = (feed as any).mocks.addItem.mock.calls[0][0];
  const secondCallArgs = (feed as any).mocks.addItem.mock.calls[1][0];

  expect(firstCallArgs.title).toEqual('pkg3@1.1.1');
  expect(firstCallArgs.date.toISOString()).toEqual('2022-10-19T17:10:30.008Z');
  expect(firstCallArgs.link).toEqual(
    'https://myconstruct.dev/packages/pkg3/v/1.1.1'
  );
  expect(firstCallArgs.content).toEqual(
    '<p>Release notes for pkg3@1.1.1</p>\n'
  );

  expect(secondCallArgs.title).toEqual('pkg2@1.24.0');
  expect(secondCallArgs.date.toISOString()).toEqual('2019-06-19T17:10:16.140Z');
  expect(secondCallArgs.link).toEqual(
    'https://myconstruct.dev/packages/pkg2/v/1.24.0'
  );
  expect(secondCallArgs.content).toEqual(
    '<p>Release notes for pkg2@1.24.0</p>\n'
  );
});

test('packages are sorted in reverse chronological order', async () => {
  await handler();

  expect((feed as any).mocks.addItem).toHaveBeenCalledTimes(2);
  const firstCallArgs = (feed as any).mocks.addItem.mock.calls[0][0];
  const secondCallArgs = (feed as any).mocks.addItem.mock.calls[1][0];

  expect(firstCallArgs.title).toEqual('pkg3@1.1.1');
  expect(firstCallArgs.date.toISOString()).toEqual('2022-10-19T17:10:30.008Z');
  expect(firstCallArgs.link).toEqual(
    'https://myconstruct.dev/packages/pkg3/v/1.1.1'
  );
  expect(firstCallArgs.content).toEqual(
    '<p>Release notes for pkg3@1.1.1</p>\n'
  );

  expect(secondCallArgs.title).toEqual('pkg2@1.24.0');
  expect(secondCallArgs.date.toISOString()).toEqual('2019-06-19T17:10:16.140Z');
  expect(secondCallArgs.link).toEqual(
    'https://myconstruct.dev/packages/pkg2/v/1.24.0'
  );
  expect(secondCallArgs.content).toEqual(
    '<p>Release notes for pkg2@1.24.0</p>\n'
  );
});

test('handle missing release-notes', async () => {
  // remove the release notes for pkg3
  const { releaseNotesKey } = constants.getObjectKeys('pkg3', '1.1.1');
  s3ObjectMap.delete(releaseNotesKey);
  await handler();
  expect((feed as any).mocks.addItem.mock.calls[0][0].content).toEqual(
    'No release notes'
  );
});
