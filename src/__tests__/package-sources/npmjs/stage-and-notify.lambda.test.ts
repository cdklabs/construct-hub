import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import * as nock from 'nock';
import {
  ENV_DENY_LIST_BUCKET_NAME,
  ENV_DENY_LIST_OBJECT_KEY,
} from '../../../backend/deny-list/constants';
import {
  handler,
  PackageVersion,
} from '../../../package-sources/npmjs/stage-and-notify.lambda';
import { stringToStream } from '../../streams';

const MOCK_DENY_LIST_BUCKET = 'deny-list-bucket-name';
const MOCK_DENY_LIST_OBJECT = 'my-deny-list.json';

beforeEach(() => {
  process.env.BUCKET_NAME = 'foo';
  process.env.QUEUE_URL = 'bar';
  process.env[ENV_DENY_LIST_BUCKET_NAME] = MOCK_DENY_LIST_BUCKET;
  process.env[ENV_DENY_LIST_OBJECT_KEY] = MOCK_DENY_LIST_OBJECT;
});

afterEach(() => {
  process.env.BUCKET_NAME = undefined;
  process.env.QUEUE_URL = undefined;
  delete process.env[ENV_DENY_LIST_BUCKET_NAME];
  delete process.env[ENV_DENY_LIST_OBJECT_KEY];
});

test('ignores 404', async () => {
  const basePath = 'https://registry.npmjs.org';
  const uri = '/@pepperize/cdk-vpc/-/cdk-vpc-0.0.785.tgz';

  const s3Mock = mockClient(S3Client);

  s3Mock.on(GetObjectCommand).resolves({
    Body: stringToStream(JSON.stringify({})),
  });

  nock(basePath).get(uri).reply(404);

  const event: PackageVersion = {
    tarballUrl: `${basePath}${uri}`,
    integrity: '09d37ec93c5518bf4842ac8e381a5c06452500e5',
    modified: '2023-09-22T15:48:10.381Z',
    name: '@pepper/cdk-vpc',
    seq: '26437963',
    version: '0.0.785',
  };

  const context: Context = {} as any;

  await expect(handler(event, context)).resolves.toBe(undefined);
});
