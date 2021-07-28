import '@aws-cdk/assert/jest';
import { GatewayVpcEndpointAwsService, InterfaceVpcEndpointAwsService, SubnetType, Vpc } from '@aws-cdk/aws-ec2';
import { FileSystem } from '@aws-cdk/aws-efs';
import { Bucket } from '@aws-cdk/aws-s3';
import { App, CfnResource, Construct, Fn, IConstruct, Stack } from '@aws-cdk/core';
import { DocumentationLanguage } from '../../../backend/shared/language';
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
  const vpc = new Vpc(stack, 'VPC');
  const efsFileSystem = new FileSystem(stack, 'EFS', { vpc });
  const efsAccessPoint = efsFileSystem.addAccessPoint('EFS-AP');

  // WHEN
  new Transliterator(stack, 'Transliterator', {
    bucket,
    efsAccessPoint: efsAccessPoint,
    language: DocumentationLanguage.PYTHON,
    monitoring,
    vpc,
  });

  // THEN
  expect(app.synth().getStackByName(stack.stackName).template).toMatchSnapshot({
    Outputs: expect.anything(),
    Parameters: expect.anything(),
    Resources: ignoreResources(stack, bucket, monitoring, vpc, efsFileSystem, efsAccessPoint),
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
  const vpc = new Vpc(stack, 'VPC');
  const efsFileSystem = new FileSystem(stack, 'EFS', { vpc });
  const efsAccessPoint = efsFileSystem.addAccessPoint('EFS-AP');
  const codeArtifact = new Repository(stack, 'CodeArtifact');

  // WHEN
  new Transliterator(stack, 'Transliterator', {
    bucket,
    codeArtifact,
    efsAccessPoint,
    language: DocumentationLanguage.PYTHON,
    monitoring,
    vpc,
  });

  // THEN
  expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
    Environment: {
      Variables: stack.resolve({
        CODE_ARTIFACT_DOMAIN_NAME: codeArtifact.repositoryDomainName,
        CODE_ARTIFACT_DOMAIN_OWNER: codeArtifact.repositoryDomainOwner,
        CODE_ARTIFACT_REPOSITORY_ENDPOINT: codeArtifact.repositoryNpmEndpoint,
      }),
    },
  });
  expect(app.synth().getStackByName(stack.stackName).template).toMatchSnapshot({
    Outputs: expect.anything(),
    Parameters: expect.anything(),
    Resources: ignoreResources(stack, bucket, monitoring, codeArtifact, vpc, efsFileSystem, efsAccessPoint),
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
  const efsAccessPoint = new FileSystem(stack, 'EFS', { vpc, vpcSubnets: { subnetType: SubnetType.ISOLATED } })
    .addAccessPoint('EFS-AP');
  const codeArtifactApi = vpc.addInterfaceEndpoint('CodeArtifact.API', {
    service: new InterfaceVpcEndpointAwsService('codeartifact.api'),
  });
  const codeArtifact = vpc.addInterfaceEndpoint('CodeArtifact.Repo', {
    service: new InterfaceVpcEndpointAwsService('codeartifact.repositories'),
  });
  const elasticFileSystem = vpc.addInterfaceEndpoint('EFS', {
    service: InterfaceVpcEndpointAwsService.ELASTIC_FILESYSTEM,
  });
  const s3 = vpc.addGatewayEndpoint('S3', {
    service: GatewayVpcEndpointAwsService.S3,
  });

  // WHEN
  new Transliterator(stack, 'Transliterator', {
    bucket,
    efsAccessPoint: efsAccessPoint,
    language: DocumentationLanguage.PYTHON,
    monitoring,
    vpc,
    vpcEndpoints: { codeArtifactApi, codeArtifact, elasticFileSystem, s3 },
    vpcSubnets: { subnetType: SubnetType.ISOLATED },
  });

  // THEN
  expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
    Environment: {
      Variables: stack.resolve({
        CODE_ARTIFACT_API_ENDPOINT: Fn.select(1, Fn.split(':', Fn.select(0, codeArtifactApi.vpcEndpointDnsEntries))),
      }),
    },
  });
  expect(app.synth().getStackByName(stack.stackName).template).toMatchSnapshot({
    Outputs: expect.anything(),
    Parameters: expect.anything(),
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
  const efsFileSystem = new FileSystem(stack, 'EFS', { vpc, vpcSubnets: { subnetType: SubnetType.ISOLATED } });
  const efsAccessPoint = efsFileSystem.addAccessPoint('EFS-AP');
  const codeArtifactApi = vpc.addInterfaceEndpoint('CodeArtifact.API', {
    service: new InterfaceVpcEndpointAwsService('codeartifact.api'),
  });
  const codeArtifact = vpc.addInterfaceEndpoint('CodeArtifact.Repo', {
    service: new InterfaceVpcEndpointAwsService('codeartifact.repositories'),
  });
  const elasticFileSystem = vpc.addInterfaceEndpoint('EFS', {
    service: InterfaceVpcEndpointAwsService.ELASTIC_FILESYSTEM,
  });
  const s3 = vpc.addGatewayEndpoint('S3', {
    service: GatewayVpcEndpointAwsService.S3,
  });

  // WHEN
  new Transliterator(stack, 'Transliterator', {
    bucket,
    codeArtifact: repository,
    efsAccessPoint,
    language: DocumentationLanguage.PYTHON,
    monitoring,
    vpc,
    vpcEndpoints: { codeArtifactApi, codeArtifact, elasticFileSystem, s3 },
    vpcSubnets: { subnetType: SubnetType.ISOLATED },
  });

  // THEN
  expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
    Environment: {
      Variables: stack.resolve({
        CODE_ARTIFACT_DOMAIN_NAME: repository.repositoryDomainName,
        CODE_ARTIFACT_DOMAIN_OWNER: repository.repositoryDomainOwner,
        CODE_ARTIFACT_REPOSITORY_ENDPOINT: repository.repositoryNpmEndpoint,
        CODE_ARTIFACT_API_ENDPOINT: Fn.select(1, Fn.split(':', Fn.select(0, codeArtifactApi.vpcEndpointDnsEntries))),
      }),
    },
  });
  expect(app.synth().getStackByName(stack.stackName).template).toMatchSnapshot({
    Outputs: expect.anything(),
    Parameters: expect.anything(),
    Resources: ignoreResources(stack, bucket, repository, monitoring, vpc, efsFileSystem, efsAccessPoint),
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
