import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { RetryUninstallablePackages } from '../../../backend/orchestration/retry-uninstallable-packages';

test('creates required resources', () => {
  const stack = new Stack();
  const bucket = new s3.Bucket(stack, 'TestBucket');
  const orchestrationStateMachine = new sfn.StateMachine(
    stack,
    'OrchestrationStateMachine',
    {
      definition: new sfn.Pass(stack, 'TestPass'),
    }
  );

  new RetryUninstallablePackages(stack, 'RetryUninstallablePackages', {
    bucket,
    orchestrationStateMachine,
  });

  const template = Template.fromStack(stack);

  // Verify state machine is created with correct name
  template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
    StateMachineName: 'RetryUninstallablePackages',
  });

  // Verify Lambda function is created
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs22.x',
  });

  // Verify IAM policies exist
  template.resourceCountIs('AWS::IAM::Policy', 3);
});
