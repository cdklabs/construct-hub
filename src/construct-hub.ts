import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import { AnyPrincipal, Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { RetentionDays } from '@aws-cdk/aws-logs';
import * as s3 from '@aws-cdk/aws-s3';
import { BlockPublicAccess } from '@aws-cdk/aws-s3';
import * as sqs from '@aws-cdk/aws-sqs';
import { Construct as CoreConstruct, Duration, Stack, Tags } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { createRestrictedSecurityGroups } from './_limited-internet-access';
import { AlarmActions, Domain } from './api';
import { DenyList, Ingestion } from './backend';
import { BackendDashboard } from './backend-dashboard';
import { DenyListRule } from './backend/deny-list/api';
import { Inventory } from './backend/inventory';
import { LicenseList } from './backend/license-list';
import { Orchestration } from './backend/orchestration';
import { PackageStats } from './backend/package-stats';
import { CATALOG_KEY, STORAGE_KEY_PREFIX } from './backend/shared/constants';
import { Repository } from './codeartifact/repository';
import { DomainRedirect, DomainRedirectSource } from './domain-redirect';
import { Monitoring } from './monitoring';
import { IPackageSource } from './package-source';
import { NpmJs } from './package-sources';
import { PackageTag } from './package-tag';
import { S3StorageFactory } from './s3/storage';
import { SpdxLicense } from './spdx-license';
import { WebApp, PackageLinkConfig, FeaturedPackages, FeatureFlags, Category } from './webapp';

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
   * @deprecated use sensitiveTaskIsolation instead.
   */
  readonly isolateSensitiveTasks?: boolean;

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
   * @default Isolation.NO_INTERNET_ACCESS
   */
  readonly sensitiveTaskIsolation?: Isolation;

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
   * @default [...SpdxLicense.apache(),...SpdxLicense.bsd(),...SpdxLicense.cddl(),...SpdxLicense.epl(),SpdxLicense.ISC,...SpdxLicense.mit(),SpdxLicense.MPL_2_0]
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

  /**
   * Configuration for custom package tags
   */
  readonly packageTags?: PackageTag[];

  /**
   * Configuration for packages to feature on the home page.
   * @default - Display the 10 most recently updated packages
   */
  readonly featuredPackages?: FeaturedPackages;

  /**
   * Configure feature flags for the web app.
   */
  readonly featureFlags?: FeatureFlags;

  /**
   * Configure whether or not the backend should periodically query NPM
   * for the number of downloads a package has in the past week, and
   * display download counts on the web app.
   *
   * @default - true if packageSources is not specified (the defaults are
   * used), false otherwise
   */
  readonly fetchPackageStats?: boolean;

  /**
   * Browse categories. Each category will appear in the home page as a button
   * with a link to the relevant search query.
   */
  readonly categories?: Category[];

  /**
   * Wire construct hub to use the failover storage buckets.
   *
   * Do not activate this property until you've populated your failover buckets
   * with the necessary data.
   *
   * @see https://github.com/cdklabs/construct-hub/blob/dev/docs/operator-runbook.md#storage-disaster
   * @default false
   */
  readonly failoverStorageActive?: boolean;

  /**
   * Additional domains which will be set up to redirect to the primary
   * construct hub domain.
   *
   * @default []
   */
  readonly additionalDomains?: DomainRedirectSource[];
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

    if (props.isolateSensitiveTasks != null && props.sensitiveTaskIsolation != null) {
      throw new Error('Supplying both isolateSensitiveTasks and sensitiveTaskIsolation is not supported. Remove usage of isolateSensitiveTasks.');
    }

    const storageFactory = new S3StorageFactory({
      failoverActive: props.failoverStorageActive,
    });

    const monitoring = new Monitoring(this, 'Monitoring', {
      alarmActions: props.alarmActions,
    });

    const packageData = storageFactory.newBucket(this, 'PackageData', {
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

    const isolation = props.sensitiveTaskIsolation
      ?? (props.isolateSensitiveTasks ? Isolation.NO_INTERNET_ACCESS : Isolation.UNLIMITED_INTERNET_ACCESS);

    // Create an internal CodeArtifact repository if we run in network-controlled mode, or if a domain is provided.
    const codeArtifact = isolation === Isolation.NO_INTERNET_ACCESS || props.codeArtifactDomain != null
      ? new Repository(this, 'CodeArtifact', {
        description: 'Proxy to npmjs.com for ConstructHub',
        domainName: props.codeArtifactDomain?.name,
        domainExists: props.codeArtifactDomain != null,
        upstreams: props.codeArtifactDomain?.upstreams,
      })
      : undefined;
    const { vpc, vpcEndpoints, vpcSubnets, vpcSecurityGroups } = this.createVpc(isolation, codeArtifact);

    const denyList = new DenyList(this, 'DenyList', {
      storageFactory: storageFactory,
      rules: props.denyList ?? [],
      packageDataBucket: packageData,
      packageDataKeyPrefix: STORAGE_KEY_PREFIX,
      monitoring: monitoring,
    });

    // disable fetching package stats by default if a different package
    // source is configured
    const fetchPackageStats = props.fetchPackageStats ?? (
      props.packageSources ? false : true
    );

    let packageStats: PackageStats | undefined;
    const statsKey = 'stats.json';
    if (fetchPackageStats) {
      packageStats = new PackageStats(this, 'Stats', {
        bucket: packageData,
        monitoring,
        logRetention: props.logRetention,
        objectKey: statsKey,
      });
    }

    const orchestration = new Orchestration(this, 'Orchestration', {
      bucket: packageData,
      codeArtifact,
      denyList,
      logRetention: props.logRetention,
      monitoring,
      vpc,
      vpcEndpoints,
      vpcSubnets,
      vpcSecurityGroups,
    });

    // rebuild the catalog when the deny list changes.
    denyList.prune.onChangeInvoke(orchestration.catalogBuilder.function);

    const packageTagsSerialized = props.packageTags?.map((config) => {
      return {
        ...config,
        condition: config.condition.bind(),
      };
    }) ?? [];

    this.ingestion = new Ingestion(this, 'Ingestion', {
      storageFactory: storageFactory,
      bucket: packageData,
      codeArtifact,
      orchestration,
      logRetention: props.logRetention,
      monitoring,
      packageLinks: props.packageLinks,
      packageTags: packageTagsSerialized,
    });

    const licenseList = new LicenseList(this, 'LicenseList', {
      storageFactory: storageFactory,
      licenses: props.allowedLicenses ?? [
        ...SpdxLicense.apache(),
        ...SpdxLicense.bsd(),
        ...SpdxLicense.cddl(),
        ...SpdxLicense.epl(),
        SpdxLicense.ISC,
        ...SpdxLicense.mit(),
        SpdxLicense.MPL_2_0,
      ],
    });

    const webApp = new WebApp(this, 'WebApp', {
      storageFactory,
      domain: props.domain,
      monitoring,
      packageData,
      packageLinks: props.packageLinks,
      packageTags: packageTagsSerialized,
      featuredPackages: props.featuredPackages,
      packageStats,
      featureFlags: props.featureFlags,
      categories: props.categories,
    });

    const sources = new CoreConstruct(this, 'Sources');
    const packageSources = (props.packageSources ?? [new NpmJs({ storageFactory })]).map(
      (source) =>
        source.bind(sources, {
          baseUrl: webApp.baseUrl,
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
      packageStats,
    });

    // add domain redirects
    if (props.domain) {
      for (const redirctSource of props.additionalDomains ?? []) {
        new DomainRedirect(this, `Redirect-${redirctSource.hostedZone.zoneName}`, {
          source: redirctSource,
          targetDomainName: props.domain?.zone.zoneName,
        });
      }
    } else {
      if (props.additionalDomains && props.additionalDomains.length > 0) {
        throw new Error('Cannot specify "domainRedirects" if a domain is not specified');
      }
    }
  }

  public get grantPrincipal(): iam.IPrincipal {
    return this.ingestion.grantPrincipal;
  }

  public get ingestionQueue(): sqs.IQueue {
    return this.ingestion.queue;
  }

  private createVpc(isolation: Isolation, codeArtifact: Repository | undefined) {
    if (isolation === Isolation.UNLIMITED_INTERNET_ACCESS) {
      return { vpc: undefined, vpcEndpoints: undefined, vpcSubnets: undefined };
    }

    const subnetType = isolation === Isolation.NO_INTERNET_ACCESS
      ? ec2.SubnetType.ISOLATED
      : ec2.SubnetType.PRIVATE_WITH_NAT;
    const vpcSubnets = { subnetType };

    const vpc = new ec2.Vpc(this, 'VPC', {
      enableDnsHostnames: true,
      enableDnsSupport: true,
      // Provision no NAT gateways if we are running ISOLATED (we wouldn't have a public subnet)
      natGateways: subnetType === ec2.SubnetType.ISOLATED ? 0 : undefined,
      // Pre-allocating PUBLIC / PRIVATE / INTERNAL subnets, regardless of use, so we don't create
      // a whole new VPC if we ever need to introduce subnets of these types.
      subnetConfiguration: [
        // If there is a PRIVATE subnet, there must also have a PUBLIC subnet (for NAT gateways).
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, reserved: subnetType === ec2.SubnetType.ISOLATED },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_NAT, reserved: subnetType === ec2.SubnetType.ISOLATED },
        { name: 'Isolated', subnetType: ec2.SubnetType.ISOLATED, reserved: subnetType !== ec2.SubnetType.ISOLATED },
      ],
    });
    Tags.of(vpc.node.defaultChild!).add('Name', vpc.node.path);

    const securityGroups = subnetType === ec2.SubnetType.PRIVATE_WITH_NAT
      ? createRestrictedSecurityGroups(this, vpc)
      : undefined;

    // Creating the CodeArtifact endpoints only if a repository is present.
    const codeArtifactEndpoints = codeArtifact && {
      codeArtifactApi: vpc.addInterfaceEndpoint('CodeArtifact.API', {
        privateDnsEnabled: false,
        service: new ec2.InterfaceVpcEndpointAwsService('codeartifact.api'),
        subnets: vpcSubnets,
        securityGroups,
      }),
      codeArtifact: vpc.addInterfaceEndpoint('CodeArtifact', {
        privateDnsEnabled: true,
        service: new ec2.InterfaceVpcEndpointAwsService('codeartifact.repositories'),
        subnets: vpcSubnets,
        securityGroups,
      }),
    };

    // We'll only use VPC endpoints if we are configured to run in an ISOLATED subnet.
    const vpcEndpoints = {
      ...codeArtifactEndpoints,
      // This is needed so that ECS workloads can use the awslogs driver
      cloudWatchLogs: vpc.addInterfaceEndpoint('CloudWatch.Logs', {
        privateDnsEnabled: true,
        service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        subnets: vpcSubnets,
        securityGroups,
      }),
      // These are needed for ECS workloads to be able to pull images
      ecrApi: vpc.addInterfaceEndpoint('ECR.API', {
        privateDnsEnabled: true,
        service: ec2.InterfaceVpcEndpointAwsService.ECR,
        subnets: vpcSubnets,
        securityGroups,
      }),
      ecr: vpc.addInterfaceEndpoint('ECR.Docker', {
        privateDnsEnabled: true,
        service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        subnets: vpcSubnets,
        securityGroups,
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
        securityGroups,
      }),
    };

    // The S3 access is necessary for the CodeArtifact Repository and ECR Docker
    // endpoints to be used (they serve objects from S3).
    vpcEndpoints.s3.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:GetObject'],
      resources: [
        // The in-region CodeArtifact S3 Bucket
        ...codeArtifact ? [`${codeArtifact.s3BucketArn}/*`] : [],
        // The in-region ECR layer bucket
        `arn:aws:s3:::prod-${Stack.of(this).region}-starport-layer-bucket/*`,
      ],
      // It doesn't seem we can constrain principals for these grants (unclear
      // which principal those calls are made from, or if that is something we
      // could name here).
      principals: [new AnyPrincipal()],
      sid: 'Allow-CodeArtifact-and-ECR',
    }));

    return { vpc, vpcEndpoints, vpcSubnets, vpcSecurityGroups: securityGroups };
  }
}

/**
 * How possibly risky operations (such as doc-generation, which requires
 * installing the indexed packages in order to trans-literate sample code) are
 * isolated to mitigate possible arbitrary code execution vulnerabilities in and
 * around `npm install` or the transliterator's use of the TypeScript compiler.
 */
export enum Isolation {
  /**
   * No isolation is done whatsoever. The doc-generation process still is
   * provisioned with least-privilege permissions, but retains complete access
   * to internet.
   *
   * While this maximizes the chances of successfully installing packages (and
   * hence successfully generating documentation for those), it is also the
   * least secure mode of operation.
   *
   * We advise you only consider using this isolation mode if you are hosting a
   * ConstructHub instance that only indexes trusted packages (including
   * transitive dependencies).
   */
  UNLIMITED_INTERNET_ACCESS,

  /**
   * The same protections as `UNLIMITED_INTERNET_ACCESS`, except outbound
   * internet connections are limited to IP address ranges corresponding to
   * hosting endpoints for npmjs.com.
   */
  LIMITED_INTERNET_ACCESS,

  /**
   * The same protections as `LIMITED_INTERNET_ACCESS`, except all remaining
   * internet access is removed. All traffic to AWS service endpoints is routed
   * through VPC Endpoints, as the compute nodes are jailed in a completely
   * isolated VPC.
   *
   * This is the most secure (and recommended) mode of operation for
   * ConstructHub instances.
   */
  NO_INTERNET_ACCESS,
}

