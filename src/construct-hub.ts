import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import { AnyPrincipal, Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { RetentionDays } from '@aws-cdk/aws-logs';
import * as s3 from '@aws-cdk/aws-s3';
import { BlockPublicAccess } from '@aws-cdk/aws-s3';
import * as sqs from '@aws-cdk/aws-sqs';
import { Construct as CoreConstruct, Duration, Stack } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { AlarmActions, Domain } from './api';
import { DenyList, Ingestion } from './backend';
import { BackendDashboard } from './backend-dashboard';
import { DenyListRule } from './backend/deny-list/api';
import { Inventory } from './backend/inventory';
import { LicenseList } from './backend/license-list';
import { Orchestration } from './backend/orchestration';
import { CATALOG_KEY, STORAGE_KEY_PREFIX } from './backend/shared/constants';
import { Repository } from './codeartifact/repository';
import { Monitoring } from './monitoring';
import { IPackageSource } from './package-source';
import { NpmJs } from './package-sources';
import { SpdxLicense } from './spdx-license';
import { WebApp, PackageLinkConfig } from './webapp';

/**
 * Props for `ConstructHub`.
 */
export interface ConstructHubProps {
  /**
   * Connect the hub to a domain (requires a hosted zone and a certificate).
   */
  readonly domain?: Domain;

  /**
   * Actions to perform when alarms are set.
   */
  readonly alarmActions?: AlarmActions;

  /**
   * Whether compute environments for sensitive tasks (which operate on
   * un-trusted complex data, such as the transliterator, which operates with
   * externally-sourced npm package tarballs) should run in network-isolated
   * environments. This implies the creation of additonal resources, including:
   *
   * - A VPC with only isolated subnets.
   * - VPC Endpoints (CloudWatch Logs, CodeArtifact, CodeArtifact API, S3, ...)
   * - A CodeArtifact Repository with an external connection to npmjs.com
   *
   * @default true
   */
  readonly isolateSensitiveTasks?: boolean;

  /**
   * How long to retain CloudWatch logs for.
   *
   * @defaults RetentionDays.TEN_YEARS
   */
  readonly logRetention?: RetentionDays;

  /**
   * The name of the CloudWatch dashboard that represents the health of backend
   * systems.
   */
  readonly backendDashboardName?: string;

  /**
   * A list of packages to block from the construct hub.
   *
   * @default []
   */
  readonly denyList?: DenyListRule[];

  /**
   * The package sources to register with this ConstructHub instance.
   *
   * @default - a standard npmjs.com package source will be configured.
   */
  readonly packageSources?: IPackageSource[];

  /**
   * The allowed licenses for packages indexed by this instance of ConstructHub.
   *
   * @default [...SpdxLicense.apache(),...SpdxLicense.bsd(),...SpdxLicense.mit()]
   */
  readonly allowedLicenses?: SpdxLicense[];

  /**
   * When using a CodeArtifact package source, it is often desirable to have
   * ConstructHub provision it's internal CodeArtifact repository in the same
   * CodeArtifact domain, and to configure the package source repository as an
   * upstream of the internal repository. This way, all packages in the source
   * are available to ConstructHub's backend processing.
   *
   * @default - none.
   */
  readonly codeArtifactDomain?: CodeArtifactDomainProps;

  /**
   * Configuration for custom package page links.
   */
  readonly packageLinks?: PackageLinkConfig[];
}

/**
 * Information pertaining to an existing CodeArtifact Domain.
 */
export interface CodeArtifactDomainProps {
  /**
   * The name of the CodeArtifact domain.
   */
  readonly name: string;

  /**
   * Any upstream repositories in this CodeArtifact domain that should be
   * configured on the internal CodeArtifact repository.
   */
  readonly upstreams?: string[];
}

/**
 * Construct Hub.
 */
export class ConstructHub extends CoreConstruct implements iam.IGrantable {
  private readonly ingestion: Ingestion;

  public constructor(
    scope: Construct,
    id: string,
    props: ConstructHubProps = {},
  ) {
    super(scope, id);

    const monitoring = new Monitoring(this, 'Monitoring', {
      alarmActions: props.alarmActions,
    });

    const packageData = new s3.Bucket(this, 'PackageData', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        // Abort multi-part uploads after 1 day
        { abortIncompleteMultipartUploadAfter: Duration.days(1) },
        // Transition non-current object versions to IA after 1 month
        {
          noncurrentVersionTransitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(31),
            },
          ],
        },
        // Permanently delete non-current object versions after 3 months
        {
          noncurrentVersionExpiration: Duration.days(90),
          expiredObjectDeleteMarker: true,
        },
        // Permanently delete non-current versions of catalog.json earlier
        { noncurrentVersionExpiration: Duration.days(7), prefix: CATALOG_KEY },
      ],
      versioned: true,
    });

    const codeArtifact = new Repository(this, 'CodeArtifact', {
      description: 'Proxy to npmjs.com for ConstructHub',
      domainName: props.codeArtifactDomain?.name,
      domainExists: props.codeArtifactDomain != null,
      upstreams: props.codeArtifactDomain?.upstreams,
    });

    const { vpc, vpcEndpoints, vpcSubnets } = this.createVpc(props, codeArtifact);

    const denyList = new DenyList(this, 'DenyList', {
      rules: props.denyList ?? [],
      packageDataBucket: packageData,
      packageDataKeyPrefix: STORAGE_KEY_PREFIX,
      monitoring: monitoring,
    });

    const orchestration = new Orchestration(this, 'Orchestration', {
      bucket: packageData,
      codeArtifact,
      denyList,
      logRetention: props.logRetention,
      monitoring,
      vpc,
      vpcEndpoints,
      vpcSubnets,
    });

    // rebuild the catalog when the deny list changes.
    denyList.prune.onChangeInvoke(orchestration.catalogBuilder);

    this.ingestion = new Ingestion(this, 'Ingestion', {
      bucket: packageData,
      orchestration,
      logRetention: props.logRetention,
      monitoring,
      packageLinks: props.packageLinks,
    });

    const licenseList = new LicenseList(this, 'LicenseList', {
      licenses: props.allowedLicenses ?? [
        ...SpdxLicense.apache(),
        ...SpdxLicense.bsd(),
        ...SpdxLicense.mit(),
      ],
    });

    const sources = new CoreConstruct(this, 'Sources');
    const packageSources = (props.packageSources ?? [new NpmJs()]).map(
      (source) =>
        source.bind(sources, {
          denyList,
          ingestion: this.ingestion,
          licenseList,
          monitoring,
          queue: this.ingestion.queue,
          repository: codeArtifact,
        }),
    );

    const inventory = new Inventory(this, 'InventoryCanary', { bucket: packageData, logRetention: props.logRetention, monitoring });

    new BackendDashboard(this, 'BackendDashboard', {
      packageData,
      dashboardName: props.backendDashboardName,
      packageSources,
      ingestion: this.ingestion,
      inventory,
      orchestration,
      denyList,
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

  private createVpc(props: ConstructHubProps, codeArtifact: Repository) {
    if (props.isolateSensitiveTasks === false) {
      return { vpc: undefined, vpcEndpoints: undefined, vpcSubnets: undefined };
    }

    const vpc = new ec2.Vpc(this, 'Lambda-VPC', {
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: 0,
      // Pre-allocating PUBLIC / PRIVATE / INTERNAL subnets, regardless of use, so we don't create
      // a whole new VPC if we ever need to introduce subnets of these types.
      subnetConfiguration: [
        // If there is a PRIVATE subnet, there must also have a PUBLIC subnet (for NAT gateways).
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, reserved: true },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE, reserved: true },
        { name: 'Isolated', subnetType: ec2.SubnetType.ISOLATED },
      ],
    });
    const vpcSubnets = { subnetType: ec2.SubnetType.ISOLATED };
    // We'll only use VPC endpoints if we are configured to run in an ISOLATED subnet.
    const vpcEndpoints = {
      codeArtifactApi: vpc.addInterfaceEndpoint('CodeArtifact.API', {
        privateDnsEnabled: false,
        service: new ec2.InterfaceVpcEndpointAwsService('codeartifact.api'),
        subnets: vpcSubnets,
      }),
      codeArtifact: vpc.addInterfaceEndpoint('CodeArtifact', {
        privateDnsEnabled: true,
        service: new ec2.InterfaceVpcEndpointAwsService('codeartifact.repositories'),
        subnets: vpcSubnets,
      }),
      // This is needed so that ECS workloads can use the awslogs driver
      cloudWatchLogs: vpc.addInterfaceEndpoint('CloudWatch.Logs', {
        privateDnsEnabled: true,
        service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        subnets: vpcSubnets,
      }),
      // These are needed for ECS workloads to be able to pull images
      ecrApi: vpc.addInterfaceEndpoint('ECR.API', {
        privateDnsEnabled: true,
        service: ec2.InterfaceVpcEndpointAwsService.ECR,
        subnets: vpcSubnets,
      }),
      ecr: vpc.addInterfaceEndpoint('ECR.Docker', {
        privateDnsEnabled: true,
        service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        subnets: vpcSubnets,
      }),
      // This is needed (among others) for CodeArtifact registry usage
      s3: vpc.addGatewayEndpoint('S3', {
        service: ec2.GatewayVpcEndpointAwsService.S3,
        subnets: [vpcSubnets],
      }),
      // This is useful for getting results from ECS tasks within workflows
      stepFunctions: vpc.addInterfaceEndpoint('StepFunctions', {
        privateDnsEnabled: true,
        service: ec2.InterfaceVpcEndpointAwsService.STEP_FUNCTIONS,
        subnets: vpcSubnets,
      }),
    };

    // The S3 access is necessary for the CodeArtifact Repository and ECR Docker
    // endpoints to be used (they serve objects from S3).
    vpcEndpoints.s3.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:GetObject'],
      resources: [
        // The in-region CodeArtifact S3 Bucket
        `${codeArtifact.s3BucketArn}/*`,
        // The in-region ECR layer bucket
        `arn:aws:s3:::prod-${Stack.of(this).region}-starport-layer-bucket/*`,
      ],
      // It doesn't seem we can constrain principals for these grants (unclear
      // which principal those calls are made from, or if that is something we
      // could name here).
      principals: [new AnyPrincipal()],
      sid: 'Allow-CodeArtifact-and-ECR',
    }));

    return { vpc, vpcEndpoints, vpcSubnets };
  }
}
