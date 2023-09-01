import * as path from 'path';
import { ExpectedResult, IntegTest } from '@aws-cdk/integ-tests-alpha';
import { App, Duration, Stack } from 'aws-cdk-lib';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Pass, StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Transliterator } from '../lib/backend/transliterator';
import { Monitoring } from '../lib/monitoring';

const app = new App();
const stack = new Stack(app, 'Stack');

const bucket = new Bucket(stack, 'Bucket');
const monitoring = new Monitoring(stack, 'Monitoring');
const cluster = new Cluster(stack, 'Cluster');
const transliterator = new Transliterator(stack, 'Transliterator', {
  bucket,
  monitoring,
});

const source = Source.asset(path.join(__dirname, 'fixtures/tests'));
new BucketDeployment(stack, 'BucketDeployment', {
  sources: [source],
  destinationBucket: bucket,
  destinationKeyPrefix: 'data/package-name/v1.2.3-dev.4',
});

const definition = new Pass(stack, 'Track Execution Infos', {
  inputPath: '$$.Execution',
  parameters: {
    'Id.$': '$.Id',
    'Name.$': '$.Name',
    'RoleArn.$': '$.RoleArn',
    'StartTime.$': '$.StartTime',
  },
  resultPath: '$.$TaskExecution',
})
  .next(
    new Pass(stack, 'Prepare doc-gen ECS Command', {
      parameters: { 'command.$': 'States.Array(States.JsonToString($))' },
      resultPath: '$.docGen',
    })
  )
  .next(
    transliterator.createEcsRunTask(stack, 'Generate docs', {
      cluster,
      inputPath: '$.docGen.command',
      resultPath: '$.docGenOutput',
    })
  );

const stateMachine = new StateMachine(stack, 'StateMachine', {
  definition,
});

const event = {
  bucket: bucket.bucketName,
  assembly: {
    key: 'data/package-name/v1.2.3-dev.4/assembly.json',
  },
  package: {
    key: 'data/package-name/v1.2.3-dev.4/package.tgz',
  },
};

const integTest = new IntegTest(app, 'transliterator-integ', {
  testCases: [stack],
});

const res = integTest.assertions.awsApiCall('StepFunctions', 'startExecution', {
  stateMachineArn: stateMachine.stateMachineArn,
  input: JSON.stringify(event),
});
const executionArn = res.getAttString('executionArn');
integTest.assertions.awsApiCall('StepFunctions', 'describeExecution', {
  executionArn,
}).expect(ExpectedResult.objectLike({
  status: 'SUCCEEDED',
})).waitForAssertions({
  totalTimeout: Duration.minutes(3),
  interval: Duration.seconds(10),
});
