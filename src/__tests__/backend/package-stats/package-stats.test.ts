import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { PackageStats } from '../../../backend/package-stats';
import { Monitoring } from '../../../monitoring';

test('creates step functions state machine with lambda functions', () => {
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const bucket = new Bucket(stack, 'TestBucket');
  const monitoring = new Monitoring(stack, 'TestMonitoring');

  new PackageStats(stack, 'PackageStats', {
    bucket,
    monitoring,
    objectKey: 'stats.json',
  });

  const template = Template.fromStack(stack);

  // Verify Step Functions state machine is created
  template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);

  // Verify Lambda functions are created
  const lambdaFunctions = template.findResources('AWS::Lambda::Function');
  const functionNames = Object.keys(lambdaFunctions);

  // Should have chunker, processor, and aggregator functions
  expect(functionNames.some((name) => name.includes('Chunker'))).toBe(true);
  expect(functionNames.some((name) => name.includes('Processor'))).toBe(true);
  expect(functionNames.some((name) => name.includes('Aggregator'))).toBe(true);

  // Verify EventBridge rule exists
  template.resourceCountIs('AWS::Events::Rule', 1);
});
