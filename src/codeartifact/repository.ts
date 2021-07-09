import { CfnDomain, CfnRepository } from '@aws-cdk/aws-codeartifact';
import { InterfaceVpcEndpoint } from '@aws-cdk/aws-ec2';
import { Effect, Grant, IGrantable, PolicyStatement } from '@aws-cdk/aws-iam';
import { Construct, IConstruct } from '@aws-cdk/core';
import { AwsCustomResource, PhysicalResourceId } from '@aws-cdk/custom-resources';

export interface RepositoryProps {
  /**
   * The description of the Repository resource.
   */
  readonly description?: string;

  /**
   * The name of the Domain.
   *
   * @default - a name is generated by CDK.
   */
  readonly domainName?: string;

  /**
   * The name of the Registry.
   *
   * @default domainName
   */
  readonly registryname?: string;
}

export interface IRepository extends IConstruct {
  /** The ARN of the CodeArtifact Domain that contains the repository. */
  readonly domainArn: string;

  /** The effective name of the CodeArtifact Domain. */
  readonly domainName: string;

  /** The owner account of the CodeArtifact Domain. */
  readonly domainOwner: string;

  /** The ARN of the CodeArtifact Repository. */
  readonly repositoryArn: string;

  /** The effective name of the CodeArtifact Repository. */
  readonly repositoryName: string;

  /** The URL to the endpoint of the CodeArtifact Repository for use with NPM. */
  readonly npmRepositoryEndpoint: string;

  /**
   * Grants read-only access to the repository, for use with NPM.
   *
   * @param grantee the entity to be granted read access.
   *
   * @returns the resulting `Grant`.
   */
  grantReadFromRepository(grantee: IGrantable): Grant;
}

export class Repository extends Construct implements IRepository {
  public readonly domainArn: string;
  public readonly domainName: string;
  public readonly domainOwner: string;
  public readonly repositoryArn: string;
  public readonly repositoryName: string;

  #npmRepositoryEndpoint?: string;

  public readonly s3BucketArn: string;

  public constructor(scope: Construct, id: string, props?: RepositoryProps) {
    super(scope, id);

    const domainName = props?.domainName ?? this.node.addr;
    const domain = new CfnDomain(this, 'Domain', { domainName });

    const repository = new CfnRepository(this, 'Default', {
      description: props?.description,
      domainName: domain.attrName,
      externalConnections: ['public:npmjs'],
      repositoryName: props?.registryname ?? domainName,
    });

    const domainDescription = new AwsCustomResource(this, 'DescribeDomain', {
      onCreate: {
        service: 'CodeArtifact',
        action: 'describeDomain',
        parameters: {
          domain: domain.attrName,
          domainOwner: domain.attrOwner,
        },
        physicalResourceId: PhysicalResourceId.fromResponse('domain.s3BucketArn'),
      },
      policy: {
        statements: [new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['codeartifact:DescribeDomain'],
          resources: [domain.attrArn],
        })],
      },
    });

    this.domainArn = domain.attrArn;
    this.domainName = repository.attrDomainName;
    this.domainOwner = repository.attrDomainOwner;
    this.repositoryArn = repository.attrArn;
    this.repositoryName = repository.attrName;
    this.s3BucketArn = domainDescription.getResponseField('domain.s3BucketArn');
  }

  public get npmRepositoryEndpoint(): string {
    if (this.#npmRepositoryEndpoint == null) {
      const serviceCall = {
        service: 'CodeArtifact',
        action: 'getRepositoryEndpoint',
        parameters: {
          domain: this.domainName,
          domainOwner: this.domainOwner,
          format: 'npm',
          repository: this.repositoryName,
        },
        physicalResourceId: PhysicalResourceId.fromResponse('repositoryEndpoint'),
      };
      const endpoint = new AwsCustomResource(this, 'GetEndpoint', {
        onCreate: serviceCall,
        onUpdate: serviceCall,
        policy: {
          statements: [new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['codeartifact:GetRepositoryEndpoint'],
            resources: [this.repositoryArn],
          })],
        },
      });
      this.#npmRepositoryEndpoint = endpoint.getResponseField('repositoryEndpoint');
    }
    return this.#npmRepositoryEndpoint;
  }

  public grantReadFromRepository(grantee: IGrantable): Grant {
    // The Grant API does not allow conditions
    const stsGrantResult = grantee.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['sts:GetServiceBearerToken'],
      conditions: { StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' } },
      resources: ['*'], // STS does not support resource-specified permissions
    }));
    if (!stsGrantResult.statementAdded) {
      return Grant.drop(grantee, 'CodeArtifact:ReadFromRepository');
    }
    return Grant.addToPrincipal({
      grantee,
      actions: [
        'codeartifact:GetAuthorizationToken',
        'codeartifact:GetRepositoryEndpoint',
        'codeartifact:ReadFromRepository',
      ],
      resourceArns: [this.domainArn, this.repositoryArn],
    });
  }

  /**
   * Obtains a view of this repository that is intended to be accessed though
   * VPC endpoints.
   *
   * @param api          an `InterfaceVpcEndpoint` to the `codeartifact.api`
   *                     service.
   * @param repositories an `InterfaceVpcEndpoint` to the
   *                    `codeartifact.repositories` service.
   *
   * @returns a view of this repository that appropriately grants permissions on
   *          the VPC endpoint policies, too.
   */
  public throughVpcEndpoint(api: InterfaceVpcEndpoint, repositories: InterfaceVpcEndpoint): IRepository {
    return new Proxy(this, {
      get(target, property, _receiver) {
        if (property === 'grantReadFromRepository') {
          return decoratedGrantReadFromRepository.bind(target);
        }
        return (target as any)[property];
      },
      getOwnPropertyDescriptor(target, property) {
        const realDescriptor = Object.getOwnPropertyDescriptor(target, property);
        if (property === 'grantReadFromRepository') {
          return {
            ...realDescriptor,
            value: decoratedGrantReadFromRepository.bind(target),
            get: undefined,
            set: undefined,
          };
        }
        return realDescriptor;
      }
    });

    function decoratedGrantReadFromRepository(this: Repository, grantee: IGrantable): Grant {
      const mainGrant = this.grantReadFromRepository(grantee);
      if (mainGrant.success) {
        api.addToPolicy(new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['sts:GetServiceBearerToken'],
          conditions: { StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' } },
          resources: ['*'], // STS does not support resource-specified permissions
          principals: [grantee.grantPrincipal],
        }));
        api.addToPolicy(new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['codeartifact:GetAuthorizationToken', 'codeartifact:GetRepositoryEndpoint'],
          resources: [this.domainArn, this.repositoryArn],
          principals: [grantee.grantPrincipal],
        }));
        repositories.addToPolicy(new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['codeartifact:ReadFromRepository'],
          resources: [this.repositoryArn],
          principals: [grantee.grantPrincipal],
        }));
      }
      return mainGrant;
    }
  }
}
