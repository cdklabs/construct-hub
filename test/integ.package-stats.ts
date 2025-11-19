import { join } from 'path';
import { ExpectedResult, IntegTest } from '@aws-cdk/integ-tests-alpha';
import { App, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { PackageStats } from '../lib/backend/package-stats';
import { Monitoring } from '../lib/monitoring';

const app = new App();
const stack = new Stack(app, 'PackageStatsInteg');

const packageData = new s3.Bucket(stack, 'PackageData', {
  autoDeleteObjects: true,
  removalPolicy: RemovalPolicy.DESTROY,
  versioned: true,
});

new BucketDeployment(stack, 'MockCatalog', {
  destinationBucket: packageData,
  sources: [Source.asset(join(__dirname, 'fixtures', 'package-stats'))],
});

const monitoring = new Monitoring(stack, 'Monitoring');

const packageStats = new PackageStats(stack, 'PackageStats', {
  bucket: packageData,
  monitoring,
  objectKey: 'stats.json',
  logRetention: Duration.days(1).toDays(),
  chunkSize: 1,
});

const { assertions: assert } = new IntegTest(app, 'package-stats-integ', {
  testCases: [stack],
});

const execution = assert.awsApiCall('StepFunctions', 'startExecution', {
  stateMachineArn: packageStats.stateMachine.stateMachineArn,
});

execution.next(
  assert
    .awsApiCall('StepFunctions', 'describeExecution', {
      executionArn: execution.getAttString('executionArn'),
    })
    .expect(
      ExpectedResult.objectLike({
        status: 'SUCCEEDED',
      })
    )
    .waitForAssertions({
      totalTimeout: Duration.minutes(5),
      interval: Duration.seconds(30),
    })
);
