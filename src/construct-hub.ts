import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import { AnyPrincipal, Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { BlockPublicAccess } from '@aws-cdk/aws-s3';
import * as sqs from '@aws-cdk/aws-sqs';
import { Construct as CoreConstruct, Duration } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { AlarmActions, Domain } from './api';
import { Discovery, Ingestion } from './backend';
import { BackendDashboard } from './backend-dashboard';
import { Inventory } from './backend/inventory';
import { Orchestration } from './backend/orchestration';
import { CATALOG_KEY } from './backend/shared/constants';
import { Repository } from './codeartifact/repository';
import { Monitoring } from './monitoring';
import { WebApp } from './webapp';

/**
 * Props for `ConstructHub`.
 */
export interface ConstructHubProps {
  /**
   * Connect the hub to a domain (requires a hosted zone and a certificate).
   */
  readonly domain?: Domain;

  /**
   * The name of the CloudWatch Dashboard created to observe this application.
   *
   * Must only contain alphanumerics, dash (-) and underscore (_).
   *
   * @default "construct-hub"
   */
  readonly dashboardName?: string;

  /**
   * Actions to perform when alarms are set.
   */
  readonly alarmActions: AlarmActions;

  /**
   * Whether sensitive Lambda functions (which operate on un-trusted complex
   * data, such as the transliterator, which operates with externally-sourced
   * npm package tarballs) should run in network-isolated environments. This
   * implies the creation of additonal resources, including:
   *
   * - A VPC with only isolated subnets.
   * - VPC Endpoints (CodeArtifact, CodeArtifact API, S3)
   * - A CodeArtifact Repository with an external connection to npmjs.com
   *
   * @default true
   */
  readonly isolateLambdas?: boolean;

  /**
   * The name of the CloudWatch dashboard that represents the health of backend
   * systems.
   */
  readonly backendDashboardName?: string;
}

/**
 * Construct Hub.
 */
export class ConstructHub extends CoreConstruct implements iam.IGrantable {
  private readonly ingestion: Ingestion;

  public constructor(scope: Construct, id: string, props: ConstructHubProps) {
    super(scope, id);

    const monitoring = new Monitoring(this, 'Monitoring', {
      alarmActions: props.alarmActions,
      dashboardName: props.dashboardName ?? 'construct-hub',
    });

    const packageData = new s3.Bucket(this, 'PackageData', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        // Abort multi-part uploads after 1 day
        { abortIncompleteMultipartUploadAfter: Duration.days(1) },
        // Transition non-current object versions to IA after 1 month
        { noncurrentVersionTransitions: [{ storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: Duration.days(31) }] },
        // Permanently delete non-current object versions after 3 months
        { noncurrentVersionExpiration: Duration.days(90), expiredObjectDeleteMarker: true },
        // Permanently delete non-current versions of catalog.json earlier
        { noncurrentVersionExpiration: Duration.days(7), prefix: CATALOG_KEY },
      ],
      versioned: true,
    });

    const codeArtifact = new Repository(this, 'CodeArtifact', { description: 'Proxy to npmjs.com for ConstructHub' });

    // We always need a VPC, regardless of the value of `isolateLambdas`, as the Transliterator
    // functions require an EFS mount, which is only available within a VPC.
    const subnetType = props.isolateLambdas ? ec2.SubnetType.ISOLATED : ec2.SubnetType.PRIVATE;
    const vpc = new ec2.Vpc(this, 'Lambda-VPC', {
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: subnetType === ec2.SubnetType.ISOLATED ? 0 : undefined,
      // Pre-allocating PUBLIC / PRIVATE / INTERNAL subnets, regardless of use, so we don't create
      // a whole new VPC each time we flip the `props.isolateLambdas` setting. We'll mark those we
      // are not actually using as `reserved` so they're not actually provisionned (or are cleaned
      // up on configuration changes).
      subnetConfiguration: [
        // If there is a PRIVATE subnet, there must also have a PUBLIC subnet (for NAT gateways).
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, reserved: subnetType !== ec2.SubnetType.PRIVATE },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE, reserved: subnetType !== ec2.SubnetType.PRIVATE },
        { name: 'Isolated', subnetType: ec2.SubnetType.ISOLATED, reserved: subnetType !== ec2.SubnetType.ISOLATED },
      ],
    });
    // We'll only use VPC endpoints if we are configured to run in an ISOLATED subnet.
    const vpcEndpoints = (subnetType === ec2.SubnetType.ISOLATED) ? {
      codeArtifactApi: vpc.addInterfaceEndpoint('CodeArtifact.API', {
        privateDnsEnabled: false,
        service: new ec2.InterfaceVpcEndpointAwsService('codeartifact.api'),
        subnets: { subnetType },
      }),
      codeArtifact: vpc.addInterfaceEndpoint('CodeArtifact', {
        privateDnsEnabled: true,
        service: new ec2.InterfaceVpcEndpointAwsService('codeartifact.repositories'),
        subnets: { subnetType },
      }),
      elasticFileSystem: vpc.addInterfaceEndpoint('EFS', {
        privateDnsEnabled: true,
        service: ec2.InterfaceVpcEndpointAwsService.ELASTIC_FILESYSTEM,
        subnets: { subnetType },
      }),
      s3: vpc.addGatewayEndpoint('S3', {
        service: ec2.GatewayVpcEndpointAwsService.S3,
        subnets: [{ subnetType }],
      }),
    } : undefined;
    // The S3 access is necessary for the CodeArtifact VPC endpoint to be used.
    vpcEndpoints?.s3.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:GetObject'],
      resources: [`${codeArtifact.s3BucketArn}/*`],
      principals: [new AnyPrincipal()],
      sid: 'Allow-CodeArtifact-Bucket',
    }));

    const orchestration = new Orchestration(this, 'Orchestration', {
      bucket: packageData,
      codeArtifact,
      monitoring,
      vpc,
      vpcEndpoints,
      vpcSubnets: { subnetType },
    });

    this.ingestion = new Ingestion(this, 'Ingestion', { bucket: packageData, orchestration, monitoring });

    const discovery = new Discovery(this, 'Discovery', { queue: this.ingestion.queue, monitoring });
    discovery.bucket.grantRead(this.ingestion);

    const inventory = new Inventory(this, 'InventoryCanary', { bucket: packageData, monitoring });

    new BackendDashboard(this, 'BackendDashboard', {
      dashboardName: props.backendDashboardName,
      discovery,
      ingestion: this.ingestion,
      inventory,
      orchestration,
    });

    new WebApp(this, 'WebApp', {
      domain: props.domain,
      monitoring,
      packageData,
    });
  }

  public get grantPrincipal(): iam.IPrincipal {
    return this.ingestion.grantPrincipal;
  }

  public get ingestionQueue(): sqs.IQueue {
    return this.ingestion.queue;
  }
}
