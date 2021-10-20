import '@aws-cdk/assert/jest';
import { GatewayVpcEndpointAwsService, InterfaceVpcEndpointAwsService, SubnetType, Vpc } from '@aws-cdk/aws-ec2';
import { Bucket } from '@aws-cdk/aws-s3';
import { App, CfnResource, Construct, Fn, IConstruct, Stack } from '@aws-cdk/core';
import { Transliterator } from '../../../backend/transliterator';
import { Repository } from '../../../codeartifact/repository';
import { Monitoring } from '../../../monitoring';

test('basic use', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const bucket = new Bucket(stack, 'Bucket');
  const monitoring = new Monitoring(stack, 'Monitoring', {
    alarmActions: { highSeverity: 'high-sev', normalSeverity: 'normal-sev' },
  });

  // WHEN
  new Transliterator(stack, 'Transliterator', {
    bucket,
    monitoring,
  });

  // THEN
  expect(app.synth().getStackByName(stack.stackName).template).toMatchSnapshot({
    Outputs: expect.anything(),
    Resources: ignoreResources(stack, bucket, monitoring),
  });
});

test('CodeArtifact repository', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const bucket = new Bucket(stack, 'Bucket');
  const monitoring = new Monitoring(stack, 'Monitoring', {
    alarmActions: { highSeverity: 'high-sev', normalSeverity: 'normal-sev' },
  });
  const codeArtifact = new Repository(stack, 'CodeArtifact');

  // WHEN
  new Transliterator(stack, 'Transliterator', {
    bucket,
    codeArtifact,
    monitoring,
  });

  // THEN
  expect(stack).toHaveResourceLike('AWS::ECS::TaskDefinition', {
    ContainerDefinitions: [{
      Environment: stack.resolve([
        { Name: 'HEADER_SPAN', Value: 'true' },
        { Name: 'AWS_EMF_ENVIRONMENT', Value: 'Local' },
        { Name: 'CODE_ARTIFACT_DOMAIN_NAME', Value: codeArtifact.repositoryDomainName },
        { Name: 'CODE_ARTIFACT_DOMAIN_OWNER', Value: codeArtifact.repositoryDomainOwner },
        { Name: 'CODE_ARTIFACT_REPOSITORY_ENDPOINT', Value: codeArtifact.repositoryNpmEndpoint },
      ]),
    }],
  });
  expect(app.synth().getStackByName(stack.stackName).template).toMatchSnapshot({
    Outputs: expect.anything(),
    Parameters: expect.anything(),
    Resources: ignoreResources(stack, bucket, monitoring, codeArtifact),
  });
});

test('VPC Endpoints', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const bucket = new Bucket(stack, 'Bucket');
  const monitoring = new Monitoring(stack, 'Monitoring', {
    alarmActions: { highSeverity: 'high-sev', normalSeverity: 'normal-sev' },
  });
  const vpc = new Vpc(stack, 'VPC', { subnetConfiguration: [{ name: 'Isolated', subnetType: SubnetType.ISOLATED }] });
  const cloudWatchLogs = vpc.addInterfaceEndpoint('CloudWatch.Logs', {
    service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
  });
  const codeArtifactApi = vpc.addInterfaceEndpoint('CodeArtifact.API', {
    service: new InterfaceVpcEndpointAwsService('codeartifact.api'),
  });
  const codeArtifact = vpc.addInterfaceEndpoint('CodeArtifact.Repo', {
    service: new InterfaceVpcEndpointAwsService('codeartifact.repositories'),
  });
  const ecrApi = vpc.addInterfaceEndpoint('ECR.API', {
    service: InterfaceVpcEndpointAwsService.ECR,
  });
  const ecr = vpc.addInterfaceEndpoint('ECR', {
    service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
  });
  const s3 = vpc.addGatewayEndpoint('S3', {
    service: GatewayVpcEndpointAwsService.S3,
  });
  const stepFunctions = vpc.addInterfaceEndpoint('StepFunctions', {
    service: InterfaceVpcEndpointAwsService.STEP_FUNCTIONS,
  });

  // WHEN
  new Transliterator(stack, 'Transliterator', {
    bucket,
    monitoring,
    vpcEndpoints: { cloudWatchLogs, codeArtifactApi, codeArtifact, ecr, ecrApi, s3, stepFunctions },
  });

  // THEN
  expect(stack).toHaveResourceLike('AWS::ECS::TaskDefinition', {
    ContainerDefinitions: [{
      Environment: stack.resolve([
        { Name: 'HEADER_SPAN', Value: 'true' },
        { Name: 'AWS_EMF_ENVIRONMENT', Value: 'Local' },
        { Name: 'CODE_ARTIFACT_API_ENDPOINT', Value: Fn.select(1, Fn.split(':', Fn.select(0, codeArtifactApi.vpcEndpointDnsEntries))) },
      ]),
    }],
  });
  expect(app.synth().getStackByName(stack.stackName).template).toMatchSnapshot({
    Outputs: expect.anything(),
    Resources: ignoreResources(stack, bucket, monitoring, vpc),
  });
});

test('VPC Endpoints and CodeArtifact repository', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const bucket = new Bucket(stack, 'Bucket');
  const repository = new Repository(stack, 'CodeArtifact');
  const monitoring = new Monitoring(stack, 'Monitoring', {
    alarmActions: { highSeverity: 'high-sev', normalSeverity: 'normal-sev' },
  });
  const vpc = new Vpc(stack, 'VPC', { subnetConfiguration: [{ name: 'Isolated', subnetType: SubnetType.ISOLATED }] });
  const codeArtifactApi = vpc.addInterfaceEndpoint('CodeArtifact.API', {
    service: new InterfaceVpcEndpointAwsService('codeartifact.api'),
  });
  const cloudWatchLogs = vpc.addInterfaceEndpoint('CloudWatch.Logs', {
    service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
  });
  const codeArtifact = vpc.addInterfaceEndpoint('CodeArtifact.Repo', {
    service: new InterfaceVpcEndpointAwsService('codeartifact.repositories'),
  });
  const ecrApi = vpc.addInterfaceEndpoint('ECR.API', {
    service: InterfaceVpcEndpointAwsService.ECR,
  });
  const ecr = vpc.addInterfaceEndpoint('ECR', {
    service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
  });
  const s3 = vpc.addGatewayEndpoint('S3', {
    service: GatewayVpcEndpointAwsService.S3,
  });
  const stepFunctions = vpc.addInterfaceEndpoint('StepFunctions', {
    service: InterfaceVpcEndpointAwsService.STEP_FUNCTIONS,
  });

  // WHEN
  new Transliterator(stack, 'Transliterator', {
    bucket,
    codeArtifact: repository,
    monitoring,
    vpcEndpoints: { cloudWatchLogs, codeArtifactApi, codeArtifact, ecr, ecrApi, s3, stepFunctions },
  });

  // THEN
  expect(stack).toHaveResourceLike('AWS::ECS::TaskDefinition', {
    ContainerDefinitions: [{
      Environment: stack.resolve([
        { Name: 'HEADER_SPAN', Value: 'true' },
        { Name: 'AWS_EMF_ENVIRONMENT', Value: 'Local' },
        { Name: 'CODE_ARTIFACT_API_ENDPOINT', Value: Fn.select(1, Fn.split(':', Fn.select(0, codeArtifactApi.vpcEndpointDnsEntries))) },
        { Name: 'CODE_ARTIFACT_DOMAIN_NAME', Value: repository.repositoryDomainName },
        { Name: 'CODE_ARTIFACT_DOMAIN_OWNER', Value: repository.repositoryDomainOwner },
        { Name: 'CODE_ARTIFACT_REPOSITORY_ENDPOINT', Value: repository.repositoryNpmEndpoint },
      ]),
    }],
  });
  expect(app.synth().getStackByName(stack.stackName).template).toMatchSnapshot({
    Outputs: expect.anything(),
    Resources: ignoreResources(stack, bucket, repository, monitoring, vpc),
  });
});

/**
 * Creates a property matcher that expects "anything" for all CfnResource
 * logicalIds found within the provided constructs.
 */
function ignoreResources(stack: Stack, ...constructs: readonly Construct[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const resource of resourcesIn(...constructs)) {
    result[stack.resolve(resource.logicalId)] = expect.anything();
  }
  return result;

  function* resourcesIn(...scopes: readonly IConstruct[]): Generator<CfnResource, void, void> {
    for (const scope of scopes) {
      if (CfnResource.isCfnResource(scope)) {
        yield scope;
      }
      yield* resourcesIn(...scope.node.children);
    }
  }
}
