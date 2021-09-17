import { MatchStyle } from '@aws-cdk/assert';
import '@aws-cdk/assert/jest';
import { InterfaceVpcEndpointAwsService, Vpc } from '@aws-cdk/aws-ec2';
import { Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { App, CfnOutput, Stack } from '@aws-cdk/core';
import { Repository } from '../../codeartifact/repository';

test('basic usage', () => {
  // GIVEN
  const stack = new Stack();

  // WHEN
  new Repository(stack, 'Repo');

  // THEN
  expect(stack).toMatchTemplate({
    Resources: {
      RepoDomainC79FB030: {
        Type: 'AWS::CodeArtifact::Domain',
        Properties: {
          DomainName: 'c8d064061d1c8680a574cd5a9f9c9c69b475d41907',
        },
      },
      Repo: {
        Type: 'AWS::CodeArtifact::Repository',
        Properties: {
          DomainName: {
            'Fn::GetAtt': [
              'RepoDomainC79FB030',
              'Name',
            ],
          },
          RepositoryName: 'c8d064061d1c8680a574cd5a9f9c9c69b475d41907',
        },
      },
    },
  }, MatchStyle.SUPERSET);
});

test('using upstreams', () => {
  // GIVEN
  const stack = new Stack();

  // WHEN
  new Repository(stack, 'Repo', { domainExists: true, domainName: 'test-domain', upstreams: ['upstream-1', 'upstream-2'] });

  // THEN
  expect(stack).toMatchTemplate({
    Resources: {
      Repo: {
        Type: 'AWS::CodeArtifact::Repository',
        Properties: {
          DomainName: 'test-domain',
          RepositoryName: 'c8d064061d1c8680a574cd5a9f9c9c69b475d41907',
          Upstreams: ['upstream-1', 'upstream-2'],
        },
      },
    },
  }, MatchStyle.SUPERSET);
});

test('external connection', () => {
  // GIVEN
  const stack = new Stack();

  // WHEN
  new Repository(stack, 'Repo').addExternalConnection('public:npmjs');

  // THEN
  expect(stack).toMatchTemplate({
    Resources: {
      RepoDomainC79FB030: {
        Type: 'AWS::CodeArtifact::Domain',
        Properties: {
          DomainName: 'c8d064061d1c8680a574cd5a9f9c9c69b475d41907',
        },
      },
      Repo: {
        Type: 'AWS::CodeArtifact::Repository',
        Properties: {
          DomainName: {
            'Fn::GetAtt': [
              'RepoDomainC79FB030',
              'Name',
            ],
          },
          RepositoryName: 'c8d064061d1c8680a574cd5a9f9c9c69b475d41907',
          ExternalConnections: ['public:npmjs'],
        },
      },
    },
  }, MatchStyle.SUPERSET);
});

test('custom domain name', () => {
  // GIVEN
  const stack = new Stack();

  // WHEN
  new Repository(stack, 'Repo', { domainName: 'custom-domain' });

  // THEN
  expect(stack).toMatchTemplate({
    Resources: {
      RepoDomainC79FB030: {
        Type: 'AWS::CodeArtifact::Domain',
        Properties: {
          DomainName: 'custom-domain',
        },
      },
      Repo: {
        Type: 'AWS::CodeArtifact::Repository',
        Properties: {
          DomainName: {
            'Fn::GetAtt': [
              'RepoDomainC79FB030',
              'Name',
            ],
          },
          RepositoryName: 'c8d064061d1c8680a574cd5a9f9c9c69b475d41907',
        },
      },
    },
  }, MatchStyle.SUPERSET);
});

test('custom repository name', () => {
  // GIVEN
  const stack = new Stack();

  // WHEN
  new Repository(stack, 'Repo', { repositoryName: 'custom-repo' });

  // THEN
  expect(stack).toMatchTemplate({
    Resources: {
      RepoDomainC79FB030: {
        Type: 'AWS::CodeArtifact::Domain',
        Properties: {
          DomainName: 'c8d064061d1c8680a574cd5a9f9c9c69b475d41907',
        },
      },
      Repo: {
        Type: 'AWS::CodeArtifact::Repository',
        Properties: {
          DomainName: {
            'Fn::GetAtt': [
              'RepoDomainC79FB030',
              'Name',
            ],
          },
          RepositoryName: 'custom-repo',
        },
      },
    },
  }, MatchStyle.SUPERSET);
});

test('custom domain & repository name', () => {
  // GIVEN
  const stack = new Stack();

  // WHEN
  new Repository(stack, 'Repo', { domainName: 'custom-domain', repositoryName: 'custom-repo' });

  // THEN
  expect(stack).toMatchTemplate({
    Resources: {
      RepoDomainC79FB030: {
        Type: 'AWS::CodeArtifact::Domain',
        Properties: {
          DomainName: 'custom-domain',
        },
      },
      Repo: {
        Type: 'AWS::CodeArtifact::Repository',
        Properties: {
          DomainName: {
            'Fn::GetAtt': [
              'RepoDomainC79FB030',
              'Name',
            ],
          },
          RepositoryName: 'custom-repo',
        },
      },
    },
  }, MatchStyle.SUPERSET);
});

test('npm repository endpoint', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');

  // WHEN
  const repo = new Repository(stack, 'Repo');
  new CfnOutput(stack, 'NpmRepositoryEndpoint', { value: repo.repositoryNpmEndpoint });

  // THEN
  expect(app.synth().getStackByName(stack.stackName).template).toMatchSnapshot({
    Parameters: expect.anything(),
    Resources: {
      AWS679f53fac002430cb0da5b7982bd22872D164C4C: {
        Properties: expect.anything(),
        Type: 'AWS::Lambda::Function',
      },
      AWS679f53fac002430cb0da5b7982bd2287ServiceRoleC1EA0FF2: {
        Properties: expect.anything(),
        Type: 'AWS::IAM::Role',
      },
      Repo: expect.anything(),
      RepoDomainC79FB030: expect.anything(),
    },
  });
});

test('S3 bucket ARN', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');

  // WHEN
  const repo = new Repository(stack, 'Repo');
  new CfnOutput(stack, 'S3BucketArn', { value: repo.s3BucketArn });

  // THEN
  expect(app.synth().getStackByName(stack.stackName).template).toMatchSnapshot({
    Parameters: expect.anything(),
    Resources: {
      AWS679f53fac002430cb0da5b7982bd22872D164C4C: {
        Properties: expect.anything(),
        Type: 'AWS::Lambda::Function',
      },
      AWS679f53fac002430cb0da5b7982bd2287ServiceRoleC1EA0FF2: {
        Properties: expect.anything(),
        Type: 'AWS::IAM::Role',
      },
      Repo: expect.anything(),
      RepoDomainC79FB030: expect.anything(),
    },
  });
});

test('grantReadFromRepository', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const role = new Role(stack, 'Role', { assumedBy: new ServicePrincipal('test.service-principal') });
  const repo = new Repository(stack, 'Repo');

  // WHEN
  repo.grantReadFromRepository(role);

  // THEN
  expect(stack).toHaveResource('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [{
        Action: 'sts:GetServiceBearerToken',
        Condition: {
          StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' },
        },
        Effect: 'Allow',
        Resource: '*',
      }, {
        Action: ['codeartifact:GetAuthorizationToken', 'codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository'],
        Effect: 'Allow',
        Resource: [
          stack.resolve(repo.repositoryDomainArn),
          stack.resolve(repo.repositoryArn),
        ],
      }],
      Version: '2012-10-17',
    },
    PolicyName: 'RoleDefaultPolicy5FFB7DAB',
    Roles: [stack.resolve(role.roleName)],
  });
});

test('throughVpcEndpoint', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const vpc = new Vpc(stack, 'VPC');
  const api = vpc.addInterfaceEndpoint('API', {
    service: new InterfaceVpcEndpointAwsService('codeartifact.api'),
  });
  const repositories = vpc.addInterfaceEndpoint('Repositories', {
    service: new InterfaceVpcEndpointAwsService('codeartifact.repositories'),
  });

  const role = new Role(stack, 'Role', { assumedBy: new ServicePrincipal('test.service-principal') });
  const repo = new Repository(stack, 'Repo');
  const vpcRepo = repo.throughVpcEndpoint(api, repositories);

  // WHEN
  vpcRepo.grantReadFromRepository(role);

  // THEN
  expect(vpcRepo.repositoryDomainOwner).toBe(repo.repositoryDomainOwner); // Example pass-through...

  expect(stack).toHaveResource('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [{
        Action: 'sts:GetServiceBearerToken',
        Condition: {
          StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' },
        },
        Effect: 'Allow',
        Resource: '*',
      }, {
        Action: ['codeartifact:GetAuthorizationToken', 'codeartifact:GetRepositoryEndpoint', 'codeartifact:ReadFromRepository'],
        Effect: 'Allow',
        Resource: [
          stack.resolve(repo.repositoryDomainArn),
          stack.resolve(repo.repositoryArn),
        ],
      }],
      Version: '2012-10-17',
    },
    PolicyName: 'RoleDefaultPolicy5FFB7DAB',
    Roles: [stack.resolve(role.roleName)],
  });

  expect(stack).toHaveResource('AWS::EC2::VPCEndpoint', {
    PolicyDocument: {
      Statement: [{
        Action: 'sts:GetServiceBearerToken',
        Condition: {
          StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' },
        },
        Effect: 'Allow',
        Principal: { AWS: stack.resolve(role.roleArn) },
        Resource: '*',
      }, {
        Action: ['codeartifact:GetAuthorizationToken', 'codeartifact:GetRepositoryEndpoint'],
        Effect: 'Allow',
        Principal: { AWS: stack.resolve(role.roleArn) },
        Resource: [
          stack.resolve(repo.repositoryDomainArn),
          stack.resolve(repo.repositoryArn),
        ],
      }],
      Version: '2012-10-17',
    },
    ServiceName: stack.resolve(`com.amazonaws.${stack.region}.codeartifact.api`),
  });

  expect(stack).toHaveResource('AWS::EC2::VPCEndpoint', {
    PolicyDocument: {
      Statement: [{
        Action: 'codeartifact:ReadFromRepository',
        Effect: 'Allow',
        Principal: { AWS: stack.resolve(role.roleArn) },
        Resource: stack.resolve(repo.repositoryArn),
      }],
      Version: '2012-10-17',
    },
    ServiceName: stack.resolve(`com.amazonaws.${stack.region}.codeartifact.repositories`),
  });
});
