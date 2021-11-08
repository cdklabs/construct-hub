import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import { AnyPrincipal, Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { RetentionDays } from '@aws-cdk/aws-logs';
import * as s3 from '@aws-cdk/aws-s3';
import { BlockPublicAccess } from '@aws-cdk/aws-s3';
import * as sqs from '@aws-cdk/aws-sqs';
import { Construct as CoreConstruct, Duration, Stack, Tags } from '@aws-cdk/core';
import { Construct } from 'constructs';
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
import { Monitoring } from './monitoring';
import { IPackageSource } from './package-source';
import { NpmJs } from './package-sources';
import { PackageTag } from './package-tag';
import { S3PrefixList } from './s3';
import { SpdxLicense } from './spdx-license';
import { WebApp, PackageLinkConfig, FeaturedPackages, FeatureFlags } from './webapp';

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
      bucket: packageData,
      codeArtifact,
      orchestration,
      logRetention: props.logRetention,
      monitoring,
      packageLinks: props.packageLinks,
      packageTags: packageTagsSerialized,
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
      packageStats,
    });

    new WebApp(this, 'WebApp', {
      domain: props.domain,
      monitoring,
      packageData,
      packageLinks: props.packageLinks,
      packageTags: packageTagsSerialized,
      featuredPackages: props.featuredPackages,
      packageStats,
      featureFlags: props.featureFlags,
    });
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
      ? this.createRestrictedSecurityGroups(vpc)
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

  /**
   * Creates SecurityGroups where "sensitive" operations should be listed,
   * which only allows DNS requests to be issued within the VPC (to the local
   * Route53 resolver), as well as HTTPS (port 443) traffic to:
   * - allow-listed IP ranges
   * - endpoints within the same SecurityGroup.
   *
   * This returns MULTIPLE security groups in order to avoid hitting the maximum
   * count of rules per security group, which is relatively low, and prefix
   * lists count as their expansions.
   *
   * There is also a limit of how many security groups can be bound to a network
   * interface (defaults to 5), so there is only so much we can do here.
   *
   * @param vpc the VPC in which a SecurityGroup is to be added.
   */
  private createRestrictedSecurityGroups(vpc: ec2.IVpc): ec2.ISecurityGroup[] {
    const securityGroups = new Array<ec2.ISecurityGroup>();

    securityGroups.push((function (scope: CoreConstruct) {
      const sg = new ec2.SecurityGroup(scope, 'InternalTraffic', {
        allowAllOutbound: false,
        description: `${scope.node.path}/SG`,
        vpc,
      });

      // Allow all traffic within the security group on port 443
      sg.connections.allowInternally(ec2.Port.tcp(443), 'Traffic within this SecurityGroup');

      // Allow access to S3. This is needed for the S3 Gateway endpoint to work.
      sg.connections.allowTo(
        NamedPeer.from(ec2.Peer.prefixList(new S3PrefixList(scope, 'S3-PrefixList').prefixListId), 'AWS S3'),
        ec2.Port.tcp(443),
        'to AWS S3',
      );

      // Allow making DNS requests, there should be a Route53 resolver wihtin the VPC.
      sg.connections.allowTo(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(53), 'to Route53 DNS resolver');
      sg.connections.allowTo(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.udp(53), 'to Route53 DNS resolver');

      return sg;
    })(this));

    const ALLOW_LIST_DIR = path.resolve(__dirname, '..', 'resources', 'vpc-allow-lists');
    for (const file of fs.readdirSync(ALLOW_LIST_DIR)) {
      const matches = /^(.+)-(IPv4|IPv6)\.txt$/.exec(file);
      if (matches == null) {
        throw new Error(`Allow-list file ${file} in ${ALLOW_LIST_DIR} is invalid: file name must end in IPv4.txt or IPv6.txt`);
      }
      const [, namespace, ipLabel] = matches;

      const entries = fs.readFileSync(path.join(ALLOW_LIST_DIR, file), 'utf8')
        .split(/\n/)
        .map((line) => {
          const match = /^\s*([^\s]+)?\s*(?:#.*)?$/.exec(line);
          if (!match) {
            throw new Error(`Invalid line in allow list ${file}: ${line}`);
          }
          const [, cidr] = match;
          return cidr;
        })
        .filter((cidr) => !!cidr)
        .sort()
        .map((cidr) => ({ cidr }));

      if (entries.length === 0) {
        continue;
      }

      // We use a SHA-1 digest of the list of prefixes to be sure we create a
      // whole new prefix list whenever it changes, so we are never bothered by
      // the maxEntries being what it is.
      const hash = entries.reduce(
        (h, { cidr }) => h.update(cidr).update('\0'),
        createHash('SHA1'),
      ).digest('hex');

      // Note - the `prefixListName` is NOT a physical ID, and so updating it
      // will NOT cause a replacement. Additionally, it needs not be unique in
      // any way.
      const pl = new ec2.CfnPrefixList(this, `${namespace}.${ipLabel}#${hash}`, {
        addressFamily: ipLabel,
        prefixListName: `${namespace}.${ipLabel}`,
        entries,
        maxEntries: entries.length,
      });
      const id = `${namespace}-${ipLabel}`;
      const sg = new ec2.SecurityGroup(this, id, {
        allowAllOutbound: false,
        description: `${this.node.path}/${id}`,
        vpc,
      });

      // We intentionally ONLY allow HTTPS though there...
      sg.connections.allowTo(
        NamedPeer.from(ec2.Peer.prefixList(pl.attrPrefixListId), pl.node.path),
        ec2.Port.tcp(443),
        `to ${namespace} (${ipLabel})`,
      );

      Tags.of(sg).add('Name', `${namespace}.${ipLabel}`);

      securityGroups.push(sg);
    }

    return securityGroups;
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

/**
 * This is to work around an issue where the peer's `uniqueId` is a token for
 * our PrefixList values, and this causes the VPC construct to "de-duplicate"
 * all of them (it considers they are identical).
 *
 * There is a fix in the latest EC2 library, however that fix isn't great
 * either, as it addresses the problem at the wrong location (in the in/egress
 * rule, instead of in the peer).
 *
 * Basically, this ensures the `uniqueId` is some string we control, so we
 * remain faithful to the declaraiton intent.
 */
class NamedPeer implements ec2.IPeer {

  public static from(peer: ec2.IPeer, name: string) {
    return new NamedPeer(peer, name);
  }

  public readonly connections: ec2.Connections = new ec2.Connections({ peer: this });

  private constructor(private readonly peer: ec2.IPeer, public readonly uniqueId: string) { }

  public get canInlineRule() {
    return this.peer.canInlineRule;
  }

  public toIngressRuleConfig() {
    return this.peer.toIngressRuleConfig();
  }

  public toEgressRuleConfig() {
    return this.peer.toEgressRuleConfig();
  }

}
