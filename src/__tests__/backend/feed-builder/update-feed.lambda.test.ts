import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import * as feed from 'feed';

import { handler } from '../../../backend/feed-builder/update-feed.lambda';
import * as constants from '../../../backend/shared/constants';


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
        mocks[methodname] = (this as any)[methodname] = jest.fn().mockImplementation((...args) => {
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
const packageReleaseDates = ['2019-06-19T17:10:16.140Z', '2022-10-19T17:10:30.008Z', '2018-10-19T17:10:30.008Z'];
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


const s3ObjectMap: Map<string, Buffer> = new Map();
let putObjectMock: jest.Mock;
beforeEach(() => {
  process.env.CATALOG_BUCKET_NAME = MOCK_CATALOG_BUCKET_NAME;
  process.env.CATALOG_OBJECT_KEY = MOCK_CATALOG_OBJECT_KEY;
  process.env.FEED_ENTRY_COUNT = MAX_ENTRIES_IN_FEED;
  process.env[constants.CONSTRUCT_HUB_URL_ENV_VAR_NAME] = MOCK_CONTRUCT_HUB_URL;
  s3ObjectMap.clear();
  // Add release-notes
  packagesInCatalog.forEach(pkgName => {
    const [name, version] = pkgName.split('@');
    const { releaseNotesKey } = constants.getObjectKeys(name, version);
    s3ObjectMap.set(releaseNotesKey, Buffer.from(`Release notes for ${pkgName}`));
  });

  s3ObjectMap.set(constants.CATALOG_KEY, Buffer.from(JSON.stringify(MOCK_CATALOG)));


  setupS3GetObjectMock().mockImplementation((req: AWS.S3.GetObjectRequest, cb) => {
    expect(req.Bucket).toEqual(MOCK_CATALOG_BUCKET_NAME);
    if (s3ObjectMap.has(req.Key)) {
      const response = { Body: s3ObjectMap.get(req.Key) };
      cb(null, response);
    }

    cb({ statusCode: 404 });
  });

  putObjectMock = setupPutObjectMock().mockImplementation((req: AWS.S3.PutObjectRequest, cb) => {
    console.log(req.Key);
    expect(req.Bucket).toEqual(MOCK_CATALOG_BUCKET_NAME);
    if (req.Key === 'atom' || req.Key === 'rss') {

      return cb(null, {});
    }
    cb({ error: 'NotSaved' }, null);
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
  expect(putObjectMock).toHaveBeenCalledTimes(2);
  expect(putObjectMock.mock.calls[0][0].Key).toEqual('atom');
  expect(putObjectMock.mock.calls[1][0].Key).toEqual('rss');

  expect((feed as any).mocks.addItem).toHaveBeenCalledTimes(2);

  expect((feed as any).mocks.addItem.mock.calls[0][0].title).toEqual('pkg3@1.1.1');
  expect((feed as any).mocks.addItem.mock.calls[0][0].date.toISOString()).toEqual('2022-10-19T17:10:30.008Z');
  expect((feed as any).mocks.addItem.mock.calls[0][0].link).toEqual('https://myconstruct.dev/packages/pkg3/v/1.1.1');
  expect((feed as any).mocks.addItem.mock.calls[0][0].content).toEqual('<p>Release notes for pkg3@1.1.1</p>\n');

  expect((feed as any).mocks.addItem.mock.calls[1][0].title).toEqual('pkg2@1.24.0');
  expect((feed as any).mocks.addItem.mock.calls[1][0].date.toISOString()).toEqual('2019-06-19T17:10:16.140Z');
  expect((feed as any).mocks.addItem.mock.calls[1][0].link).toEqual('https://myconstruct.dev/packages/pkg2/v/1.24.0');
  expect((feed as any).mocks.addItem.mock.calls[1][0].content).toEqual('<p>Release notes for pkg2@1.24.0</p>\n');
});

test('packages are sorted in reverse chronological order', async () => {
  await handler();

  expect((feed as any).mocks.addItem).toHaveBeenCalledTimes(2);

  expect((feed as any).mocks.addItem.mock.calls[0][0].title).toEqual('pkg3@1.1.1');
  expect((feed as any).mocks.addItem.mock.calls[0][0].date.toISOString()).toEqual('2022-10-19T17:10:30.008Z');
  expect((feed as any).mocks.addItem.mock.calls[0][0].link).toEqual('https://myconstruct.dev/packages/pkg3/v/1.1.1');
  expect((feed as any).mocks.addItem.mock.calls[0][0].content).toEqual('<p>Release notes for pkg3@1.1.1</p>\n');

  expect((feed as any).mocks.addItem.mock.calls[1][0].title).toEqual('pkg2@1.24.0');
  expect((feed as any).mocks.addItem.mock.calls[1][0].date.toISOString()).toEqual('2019-06-19T17:10:16.140Z');
  expect((feed as any).mocks.addItem.mock.calls[1][0].link).toEqual('https://myconstruct.dev/packages/pkg2/v/1.24.0');
  expect((feed as any).mocks.addItem.mock.calls[1][0].content).toEqual('<p>Release notes for pkg2@1.24.0</p>\n');
});

test('handle missing release-notes', async () => {
  // remove the release notes for pkg3
  const { releaseNotesKey } = constants.getObjectKeys('pkg3', '1.1.1');
  s3ObjectMap.delete(releaseNotesKey);
  await handler();
  expect((feed as any).mocks.addItem.mock.calls[0][0].content).toEqual('No release notes');
});

type Response<T> = (err: AWS.AWSError | null, data?: T) => void;
const setupS3GetObjectMock = () => {
  const spy = jest.fn();
  AWSMock.mock(
    'S3',
    'getObject',
    (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
      return spy(req, cb);
    },
  );
  return spy;
};

function setupPutObjectMock() {
  const spy = jest.fn();
  AWSMock.mock(
    'S3',
    'putObject',
    (req: AWS.S3.PutObjectRequest, cb: Response<AWS.S3.PutObjectOutput>) => {
      return spy(req, cb);
    },
  );
  return spy;
}