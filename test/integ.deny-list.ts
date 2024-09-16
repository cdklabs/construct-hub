import { join } from 'path';
import { ExpectedResult, IntegTest } from '@aws-cdk/integ-tests-alpha';
import { App, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { CatalogBuilderMock } from '../lib/__tests__/backend/deny-list/mocks/catalog-builder-mock';
import { ClientTest } from '../lib/__tests__/backend/deny-list/mocks/client-test';
import { PruneTest } from '../lib/__tests__/backend/deny-list/mocks/prune-test';
import { DenyList } from '../lib/backend';
import { STORAGE_KEY_PREFIX } from '../lib/backend/shared/constants';
import { Monitoring } from '../lib/monitoring';
import { OverviewDashboard } from '../lib/overview-dashboard';

const mockPackageDataDir = join(
  __dirname,
  'fixtures',
  'deny-list',
  'package-data'
);

const app = new App();
const stack = new Stack(app, 'DenyListInteg');

const packageData = new s3.Bucket(stack, 'MockDataBucket', {
  autoDeleteObjects: true,
  removalPolicy: RemovalPolicy.DESTROY,
});

new BucketDeployment(stack, 'MockData', {
  destinationBucket: packageData,
  sources: [Source.asset(mockPackageDataDir)],
});

const monitoring = new Monitoring(stack, 'Monitoring');
const overviewDashboard = new OverviewDashboard(stack, 'OverviewDashboard');

const denylist = new DenyList(stack, 'DenyList', {
  monitoring: monitoring,
  overviewDashboard: overviewDashboard,
  packageDataBucket: packageData,
  packageDataKeyPrefix: STORAGE_KEY_PREFIX,
  rules: [
    { packageName: 'mypackage', reason: '"mypackage" is deprecated' },
    {
      packageName: 'your',
      version: '1.2.3',
      reason: 'v1.2.3 of "your" has a security issue',
    },
  ],
});

const catalogBuilderMock = new CatalogBuilderMock(stack, 'CatalogBuilderMock');
denylist.prune.onChangeInvoke(catalogBuilderMock);

const assertionStack = new Stack(app, 'DenyListAssertions');

const clientTest = new ClientTest(assertionStack, 'ClientTest', {
  environment: {
    BUCKET_NAME: denylist.bucket.bucketName,
    FILE_NAME: denylist.objectKey,
  },
});
denylist.grantRead(clientTest);

const pruneTest = new PruneTest(assertionStack, 'PruneTest', {
  timeout: Duration.minutes(5),
  environment: {
    BUCKET_NAME: packageData.bucketName,
    TIMEOUT_SEC: Duration.minutes(2).toSeconds().toString(),
    EXPECTED_KEYS: JSON.stringify([
      'data/your/v1.2.4/world.txt',
      'data/your/v1.2.4/hello.txt',
    ]),
  },
});
packageData.grantRead(pruneTest);

const { assertions: assert } = new IntegTest(app, 'deny-list-integ', {
  testCases: [stack],
  assertionStack,
});

assert
  .invokeFunction({
    functionName: clientTest.functionName,
  })
  .expect(
    ExpectedResult.objectLike({
      StatusCode: 200,
    })
  );

assert
  .invokeFunction({
    functionName: pruneTest.functionName,
  })
  .expect(
    ExpectedResult.objectLike({
      StatusCode: 200,
    })
  );
