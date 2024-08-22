import { ArnFormat, Duration, Fn, Stack } from 'aws-cdk-lib';
import {
  GatewayVpcEndpoint,
  InterfaceVpcEndpoint,
  SubnetSelection,
  ISecurityGroup,
} from 'aws-cdk-lib/aws-ec2';
import {
  ContainerDefinition,
  CpuArchitecture,
  FargatePlatformVersion,
  FargateTaskDefinition,
  ICluster,
  LogDrivers,
  OperatingSystemFamily,
  UlimitName,
} from 'aws-cdk-lib/aws-ecs';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { ILogGroup, LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import {
  IntegrationPattern,
  JsonPath,
  TaskStateBaseProps,
} from 'aws-cdk-lib/aws-stepfunctions';
import {
  EcsFargateLaunchTarget,
  EcsRunTask,
} from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { Transliterator as Container, MEMORY_LIMIT } from './transliterator';
import { Repository } from '../../codeartifact/repository';
import { Monitoring } from '../../monitoring';
import * as s3 from '../../s3';
import * as constants from '../shared/constants';
import { DocumentationLanguage } from '../shared/language';

export interface TransliteratorProps {
  /**
   * The bucket in which to source assemblies to transliterate.
   */
  readonly bucket: IBucket;

  /**
   * The CodeArtifact registry to use for regular operations.
   */
  readonly codeArtifact?: Repository;

  /**
   * The monitoring handler to register alarms with.
   */
  readonly monitoring: Monitoring;

  /**
   * VPC endpoints to use for interacting with CodeArtifact and S3.
   */
  readonly vpcEndpoints?: TransliteratorVpcEndpoints;

  /**
   * How long should execution logs be retained?
   *
   * @default RetentionDays.TEN_YEARS
   */
  readonly logRetention?: RetentionDays;
}

export interface TransliteratorVpcEndpoints {
  /**
   * The VPC endpoint for the CloudWatch Logs API.
   */
  readonly cloudWatchLogs: InterfaceVpcEndpoint;

  /**
   * The VPC endpoint for the CodeArtifact API (service: 'codeartifact.api')
   */
  readonly codeArtifactApi?: InterfaceVpcEndpoint;

  /**
   * The VPC endpoint for the CodeArtifact repositories (service: 'codeartifact.repositories')
   */
  readonly codeArtifact?: InterfaceVpcEndpoint;

  /**
   * The VPC endpoint to interact with ECR.
   */
  readonly ecrApi: InterfaceVpcEndpoint;

  /**
   * The VPC endpoint to interact with ECR.
   */
  readonly ecr: InterfaceVpcEndpoint;

  /**
   * The VPC endpoint for the S3
   */
  readonly s3: GatewayVpcEndpoint;

  /**
   * The VPC endpoint for StepFunctions.
   */
  readonly stepFunctions: InterfaceVpcEndpoint;
}

/**
 * Transliterates jsii assemblies to various other languages.
 */
export class Transliterator extends Construct {
  public readonly containerDefinition: ContainerDefinition;
  public readonly logGroup: ILogGroup;

  public get taskDefinition() {
    return this.containerDefinition.taskDefinition;
  }

  public constructor(scope: Construct, id: string, props: TransliteratorProps) {
    super(scope, id);

    const repository =
      props.vpcEndpoints?.codeArtifact && props.vpcEndpoints.codeArtifactApi
        ? props.codeArtifact?.throughVpcEndpoint(
            props.vpcEndpoints.codeArtifactApi,
            props.vpcEndpoints.codeArtifact
          )
        : props.codeArtifact;

    const bucket = props.vpcEndpoints
      ? s3.throughVpcEndpoint(props.bucket, props.vpcEndpoints.s3)
      : props.bucket;

    const environment: Record<string, string> = {
      // temporaty hack to generate construct-hub compliant markdown.
      // see https://github.com/cdklabs/jsii-docgen/blob/master/src/docgen/render/markdown.ts#L172
      HEADER_SPAN: 'true',
      // Set embedded metrics format environment to "Local", to have a consistent experience.
      AWS_EMF_ENVIRONMENT: 'Local',
    };
    if (props.vpcEndpoints?.codeArtifactApi) {
      // Those are returned as an array of HOSTED_ZONE_ID:DNS_NAME... We care
      // only about the DNS_NAME of the first entry in that array (which is
      // the AZ-agnostic DNS name).
      environment.CODE_ARTIFACT_API_ENDPOINT = Fn.select(
        1,
        Fn.split(
          ':',
          Fn.select(0, props.vpcEndpoints.codeArtifactApi.vpcEndpointDnsEntries)
        )
      );
    }
    if (props.codeArtifact) {
      environment.CODE_ARTIFACT_DOMAIN_NAME =
        props.codeArtifact.repositoryDomainName;
      environment.CODE_ARTIFACT_DOMAIN_OWNER =
        props.codeArtifact.repositoryDomainOwner;
      environment.CODE_ARTIFACT_REPOSITORY_ENDPOINT =
        props.codeArtifact.repositoryNpmEndpoint;
    }

    this.logGroup = new LogGroup(this, 'LogGroup', {
      retention: props.logRetention,
    });

    this.containerDefinition = new Container(this, 'Resource', {
      environment,
      logging: LogDrivers.awsLogs({
        logGroup: this.logGroup,
        streamPrefix: 'transliterator',
      }),
      taskDefinition: new FargateTaskDefinition(this, 'TaskDefinition', {
        cpu: 4_096,
        memoryLimitMiB: MEMORY_LIMIT,
        runtimePlatform: {
          cpuArchitecture: CpuArchitecture.ARM64,
          operatingSystemFamily: OperatingSystemFamily.LINUX,
        },
      }),
    });
    // Encountered an error of "EMFILE: too many open files" in ECS.
    // Default nofile ulimit is 1024/4096.
    //
    // For ECS ulimit documentation see: https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Ulimit.html
    // For construct hub tracking issue see: https://github.com/cdklabs/construct-hub/issues/982
    this.containerDefinition.addUlimits({
      name: UlimitName.NOFILE, // file descriptors
      softLimit: 16_384,
      hardLimit: 65_535,
    });

    repository?.grantReadFromRepository(this.taskDefinition.taskRole);

    // The task handler reads & writes to this bucket.
    bucket.grantRead(
      this.taskDefinition.taskRole,
      `${constants.STORAGE_KEY_PREFIX}*${constants.ASSEMBLY_KEY_SUFFIX}`
    );
    bucket.grantRead(
      this.taskDefinition.taskRole,
      `${constants.STORAGE_KEY_PREFIX}*${constants.PACKAGE_KEY_SUFFIX}`
    );
    bucket.grantRead(
      this.taskDefinition.taskRole,
      `${constants.STORAGE_KEY_PREFIX}*${constants.UNINSTALLABLE_PACKAGE_SUFFIX}`
    );
    bucket.grantWrite(
      this.taskDefinition.taskRole,
      `${constants.STORAGE_KEY_PREFIX}*${constants.UNINSTALLABLE_PACKAGE_SUFFIX}`
    );
    bucket.grantDelete(
      this.taskDefinition.taskRole,
      `${constants.STORAGE_KEY_PREFIX}*${constants.UNINSTALLABLE_PACKAGE_SUFFIX}`
    );
    for (const language of DocumentationLanguage.ALL) {
      bucket.grantWrite(
        this.taskDefinition.taskRole,
        `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(language)}`
      );
      bucket.grantWrite(
        this.taskDefinition.taskRole,
        `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(
          language,
          '*'
        )}`
      );
      bucket.grantWrite(
        this.taskDefinition.taskRole,
        `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(language)}${
          constants.NOT_SUPPORTED_SUFFIX
        }`
      );
      bucket.grantRead(
        this.taskDefinition.taskRole,
        `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(language)}${
          constants.NOT_SUPPORTED_SUFFIX
        }`
      );
      bucket.grantWrite(
        this.taskDefinition.taskRole,
        `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(
          language,
          '*'
        )}${constants.NOT_SUPPORTED_SUFFIX}`
      );
      bucket.grantRead(
        this.taskDefinition.taskRole,
        `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(
          language,
          '*'
        )}${constants.NOT_SUPPORTED_SUFFIX}`
      );
      bucket.grantRead(
        this.taskDefinition.taskRole,
        `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(language)}${
          constants.CORRUPT_ASSEMBLY_SUFFIX
        }`
      );
      bucket.grantWrite(
        this.taskDefinition.taskRole,
        `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(language)}${
          constants.CORRUPT_ASSEMBLY_SUFFIX
        }`
      );
      bucket.grantRead(
        this.taskDefinition.taskRole,
        `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(
          language,
          '*'
        )}${constants.CORRUPT_ASSEMBLY_SUFFIX}`
      );
      bucket.grantWrite(
        this.taskDefinition.taskRole,
        `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(
          language,
          '*'
        )}${constants.CORRUPT_ASSEMBLY_SUFFIX}`
      );
      bucket.grantDelete(
        this.taskDefinition.taskRole,
        `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(language)}${
          constants.CORRUPT_ASSEMBLY_SUFFIX
        }`
      );
      bucket.grantDelete(
        this.taskDefinition.taskRole,
        `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(
          language,
          '*'
        )}${constants.CORRUPT_ASSEMBLY_SUFFIX}`
      );
    }

    const executionRole = this.taskDefinition.obtainExecutionRole();
    props.vpcEndpoints?.ecrApi.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'], // Action does not support resource scoping
        principals: [executionRole],
        sid: 'Allow-ECR-ReadOnly',
      })
    );
    props.vpcEndpoints?.ecr.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
        ],
        // We cannot get the ECR repository info from an asset... So scoping down to same-account repositories instead...
        resources: [
          Stack.of(this).formatArn({
            service: 'ecr',
            resource: 'repository',
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
            resourceName: '*',
          }),
        ],
        principals: [executionRole],
        sid: 'Allow-ECR-ReadOnly',
      })
    );

    props.vpcEndpoints?.cloudWatchLogs.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [
          Stack.of(this).formatArn({
            service: 'logs',
            resource: 'log-group',
            arnFormat: ArnFormat.COLON_RESOURCE_NAME,
            resourceName: this.logGroup.logGroupName,
          }),
          Stack.of(this).formatArn({
            service: 'logs',
            resource: 'log-group',
            arnFormat: ArnFormat.COLON_RESOURCE_NAME,
            resourceName: `${this.logGroup.logGroupName}:log-stream:*`,
          }),
        ],
        principals: [executionRole],
        sid: 'Allow-Logging',
      })
    );

    props.vpcEndpoints?.stepFunctions.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'states:SendTaskFailure',
          'states:SendTaskHeartbeat',
          'states:SendTaskSuccess',
        ],
        resources: ['*'], // Actions don't support resource scoping
        principals: [this.taskDefinition.taskRole],
        sid: 'Allow-StepFunctions-Callbacks',
      })
    );
  }

  public createEcsRunTask(
    scope: Construct,
    id: string,
    opts: CreateEcsRunTaskOpts
  ): EcsRunTask {
    return new EcsRunTask(scope, id, {
      // The container sends heartbeats every minute, but when the runloop will
      // actually get to submitting it is fairly dependent on the async
      // workload's nature... so we don't rely on it all too strongly, and
      // default to a 5 minutes timeout here as a minimal protection. Options
      // may override this liberally if they know better.
      heartbeat: Duration.minutes(5),
      ...opts,
      containerOverrides: [
        {
          containerDefinition: this.containerDefinition,
          command: JsonPath.listAt('$'),
          environment: [
            { name: 'SFN_TASK_TOKEN', value: JsonPath.taskToken },
            // PLACEHOLDER: Set this to something non-empty to enable lsof running...
            { name: 'RUN_LSOF_ON_HEARTBEAT', value: '' },
          ],
          memoryLimit: 9216,
          cpu: 4096,
        },
      ],
      integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      launchTarget: new EcsFargateLaunchTarget({
        platformVersion: FargatePlatformVersion.VERSION1_4,
      }),
      subnets: opts.vpcSubnets,
      securityGroups: opts.securityGroups,
      taskDefinition: this.taskDefinition,
    });
  }
}

export interface CreateEcsRunTaskOpts extends TaskStateBaseProps {
  /**
   * The ECS cluster to use for running the task (must support Fargate)
   */
  readonly cluster: ICluster;

  /**
   * The input path to the transliterator input object, presented as an array
   * containing a single JSON-encoded object.
   *
   * This is due to the lack of an ability to "cleanly" model an API where the
   * `createEcsRunTask` method could do the input processing properly...
   */
  readonly inputPath: string;

  /**
   * VPC Subnet placement options, if relevant.
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * Existing security groups to use for the tasks.
   *
   * @default - A new security group is created
   */
  readonly securityGroups?: ISecurityGroup[];
}
