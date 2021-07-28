import { join } from 'path';
import * as s3 from '@aws-cdk/aws-s3';
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment';
import { App, Duration, RemovalPolicy, Stack } from '@aws-cdk/core';
import { DenyList } from '../../../../backend';
import { STORAGE_KEY_PREFIX } from '../../../../backend/shared/constants';
import { Monitoring } from '../../../../monitoring';
import { CatalogBuilderMock } from './catalog-builder-mock';
import { TriggerClientTest } from './trigger.client-test';
import { TriggerPruneTest } from './trigger.prune-test';

// we need to pull mock package data from `src/` because we execute in `lib/`
const mockPackageDataDir = join(__dirname, '..', '..', '..', '..', '..', 'src', '__tests__', 'backend', 'deny-list', 'integ', 'package-data');

const app = new App();
const stack = new Stack(app, 'TestDenyList');

const packageData = new s3.Bucket(stack, 'MockDataBucket', {
  autoDeleteObjects: true,
  removalPolicy: RemovalPolicy.DESTROY,
});

new BucketDeployment(stack, 'MockData', {
  destinationBucket: packageData,
  sources: [Source.asset(mockPackageDataDir)],
});

const monitoring = new Monitoring(stack, 'Monitoring');

const denylist = new DenyList(stack, 'DenyList', {
  monitoring: monitoring,
  packageDataBucket: packageData,
  packageDataKeyPrefix: STORAGE_KEY_PREFIX,
  rules: [
    { package: 'mypackage', reason: '"mypackage" is deprecated' },
    { package: 'your', version: '1.2.3', reason: 'v1.2.3 of "your" has a security issue' },
  ],
});

const catalogBuilderMock = new CatalogBuilderMock(stack, 'CatalogBuilderMock');
denylist.prune.onChangeInvoke(catalogBuilderMock);

const test1 = new TriggerClientTest(stack, 'ClientTest', {
  invokeAfter: [denylist],
  environment: {
    BUCKET_NAME: denylist.bucket.bucketName,
    FILE_NAME: denylist.objectKey,
  },
});
denylist.grantRead(test1);


const test2 = new TriggerPruneTest(stack, 'PruneTest', {
  invokeAfter: [denylist],
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

packageData.grantRead(test2);

app.synth();