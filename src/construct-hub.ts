import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import { AnyPrincipal, Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { BlockPublicAccess } from '@aws-cdk/aws-s3';
import * as sqs from '@aws-cdk/aws-sqs';
import { Construct as CoreConstruct, Duration } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { AlarmActions, Domain } from './api';
import { CatalogBuilder, DenyList, Discovery, Ingestion, Transliterator } from './backend';
import { DenyListRule } from './backend/deny-list/api';
import { Inventory } from './backend/inventory';
import { STORAGE_KEY_PREFIX } from './backend/shared/constants';
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
   * A list of packages to block from the construct hub.
   *
   * @default []
   */
  readonly denyList?: DenyListRule[];
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
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        // Abort multi-part uploads after 1 day
        { abortIncompleteMultipartUploadAfter: Duration.days(1) },
        // Transition non-current object versions to IA after 1 month
        { noncurrentVersionTransitions: [{ storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: Duration.days(31) }] },
        // Permanently delete non-current object versions after 3 months
        { noncurrentVersionExpiration: Duration.days(90) },
      ],
      versioned: true,
    });

    const denyList = new DenyList(this, 'DenyList', {
      rules: props.denyList,
      packageDataBucket: packageData,
      packageDataKeyPrefix: STORAGE_KEY_PREFIX,
    });

    const codeArtifact = new Repository(this, 'CodeArtifact', { description: 'Proxy to npmjs.com for ConstructHub' });

    const vpc = (props.isolateLambdas ?? true)
      ? new ec2.Vpc(this, 'VPC', {
        enableDnsHostnames: true,
        enableDnsSupport: true,
        natGateways: 0,
        subnetConfiguration: [{ name: 'Isolated', subnetType: ec2.SubnetType.ISOLATED }],
      })
      : undefined;
    const vpcEndpoints = vpc && {
      codeArtifactApi: vpc.addInterfaceEndpoint('CodeArtifact.API', {
        privateDnsEnabled: false,
        service: new ec2.InterfaceVpcEndpointAwsService('codeartifact.api'),
        subnets: { subnetType: ec2.SubnetType.ISOLATED },
      }),
      codeArtifact: vpc.addInterfaceEndpoint('CodeArtifact', {
        privateDnsEnabled: true,
        service: new ec2.InterfaceVpcEndpointAwsService('codeartifact.repositories'),
        subnets: { subnetType: ec2.SubnetType.ISOLATED },
      }),
      s3: vpc.addGatewayEndpoint('S3', {
        service: ec2.GatewayVpcEndpointAwsService.S3,
        subnets: [{ subnetType: ec2.SubnetType.ISOLATED }],
      }),
    };
    // The S3 access is necessary for the CodeArtifact VPC endpoint to be used.
    vpcEndpoints?.s3.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:GetObject'],
      resources: [`${codeArtifact.s3BucketArn}/*`],
      principals: [new AnyPrincipal()],
      sid: 'Allow-CodeArtifact-Bucket',
    }));

    this.ingestion = new Ingestion(this, 'Ingestion', { bucket: packageData, monitoring });

    const discovery = new Discovery(this, 'Discovery', { queue: this.ingestion.queue, monitoring, denyList });
    discovery.bucket.grantRead(this.ingestion);

    new Transliterator(this, 'Transliterator', { bucket: packageData, codeArtifact, monitoring, vpc, vpcEndpoints });
    new CatalogBuilder(this, 'CatalogBuilder', { bucket: packageData, monitoring });

    new Inventory(this, 'InventoryCanary', { bucket: packageData, monitoring });

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
