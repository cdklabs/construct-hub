import { GatewayVpcEndpoint, InterfaceVpcEndpoint, SubnetSelection } from '@aws-cdk/aws-ec2';
import { ContainerDefinition, FargatePlatformVersion, FargateTaskDefinition, ICluster, LogDrivers } from '@aws-cdk/aws-ecs';
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { IBucket } from '@aws-cdk/aws-s3';
import { IntegrationPattern, JsonPath, TaskStateBaseProps } from '@aws-cdk/aws-stepfunctions';
import { EcsFargateLaunchTarget, EcsRunTask } from '@aws-cdk/aws-stepfunctions-tasks';
import { Construct, Duration, Fn } from '@aws-cdk/core';
import { Repository } from '../../codeartifact/repository';
import { Monitoring } from '../../monitoring';
import * as s3 from '../../s3';
import * as constants from '../shared/constants';
import { DocumentationLanguage } from '../shared/language';
import { Transliterator as Container } from './transliterator';

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
  readonly codeArtifactApi: InterfaceVpcEndpoint;

  /**
   * The VPC endpoint for the CodeArtifact repositories (service: 'codeartifact.repositories')
   */
  readonly codeArtifact: InterfaceVpcEndpoint;

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

  public get taskDefinition() {
    return this.containerDefinition.taskDefinition;
  }

  public constructor(scope: Construct, id: string, props: TransliteratorProps) {
    super(scope, id);

    const repository = props.vpcEndpoints
      ? props.codeArtifact?.throughVpcEndpoint(props.vpcEndpoints.codeArtifactApi, props.vpcEndpoints.codeArtifact)
      : props.codeArtifact;

    const bucket = props.vpcEndpoints
      ? s3.throughVpcEndpoint(props.bucket, props.vpcEndpoints.s3)
      : props.bucket;

    const environment: Record<string, string> = {
      // temporaty hack to generate construct-hub compliant markdown.
      // see https://github.com/cdklabs/jsii-docgen/blob/master/src/docgen/render/markdown.ts#L172
      HEADER_SPAN: 'true',
    };
    if (props.vpcEndpoints) {
      // Those are returned as an array of HOSTED_ZONE_ID:DNS_NAME... We care
      // only about the DNS_NAME of the first entry in that array (which is
      // the AZ-agnostic DNS name).
      environment.CODE_ARTIFACT_API_ENDPOINT = Fn.select(1,
        Fn.split(':',
          Fn.select(0, props.vpcEndpoints.codeArtifactApi.vpcEndpointDnsEntries),
        ),
      );
    }
    if (props.codeArtifact) {
      environment.CODE_ARTIFACT_DOMAIN_NAME = props.codeArtifact.repositoryDomainName;
      environment.CODE_ARTIFACT_DOMAIN_OWNER = props.codeArtifact.repositoryDomainOwner;
      environment.CODE_ARTIFACT_REPOSITORY_ENDPOINT = props.codeArtifact.repositoryNpmEndpoint;
    }

    this.containerDefinition = new Container(this, 'Resource', {
      environment,
      logging: LogDrivers.awsLogs({ logRetention: props.logRetention, streamPrefix: 'transliterator' }),
      taskDefinition: new FargateTaskDefinition(this, 'TaskDefinition', {
        cpu: 4_096,
        memoryLimitMiB: 8_192,
      }),
    });

    repository?.grantReadFromRepository(this.taskDefinition.taskRole);

    // The handler reads & writes to this bucket.
    bucket.grantRead(this.taskDefinition.taskRole, `${constants.STORAGE_KEY_PREFIX}*${constants.ASSEMBLY_KEY_SUFFIX}`);
    for (const language of DocumentationLanguage.ALL) {
      bucket.grantWrite(this.taskDefinition.taskRole, `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(language)}`);
      bucket.grantWrite(this.taskDefinition.taskRole, `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(language, '*')}`);
      bucket.grantWrite(this.taskDefinition.taskRole, `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(language)}${constants.NOT_SUPPORTED_SUFFIX}`);
      bucket.grantWrite(this.taskDefinition.taskRole, `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(language, '*')}${constants.NOT_SUPPORTED_SUFFIX}`);
    }

    const executionRole = this.taskDefinition.obtainExecutionRole();
    props.vpcEndpoints?.ecrApi.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'ecr:GetAuthorizationToken',
      ],
      resources: ['*'],
      principals: [executionRole],
      sid: 'Allow-ECR-ReadOnly',
    }));
    props.vpcEndpoints?.ecr.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
      ],
      resources: ['*'],
      principals: [executionRole],
      sid: 'Allow-ECR-ReadOnly',
    }));

    props.vpcEndpoints?.cloudWatchLogs.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['*'],
      principals: [executionRole],
      sid: 'Allow-Logging',
    }));

    props.vpcEndpoints?.stepFunctions.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'states:SendTaskFailure',
        'states:SendTaskHeartbeat',
        'states:SendTaskSuccess',
      ],
      resources: ['*'],
      principals: [this.taskDefinition.taskRole],
      sid: 'Allow-StepFunctions-Callbacks',
    }));
  }

  public createEcsRunTask(
    scope: Construct,
    id: string,
    opts: CreateEcsRunTaskOpts,
  ): EcsRunTask {
    return new EcsRunTask(scope, id, {
      // The container sends heartbeats every minute, but when the runloop will
      // actually get to submitting it is fairly dependent on the async
      // workload's nature... so we don't rely on it all too strongly, and
      // default to a 5 minutes timeout here as a minimal protection. Options
      // may override this liberally if they know better.
      heartbeat: Duration.minutes(5),
      ...opts,
      containerOverrides: [{
        containerDefinition: this.containerDefinition,
        command: JsonPath.listAt('$'),
        environment: [
          { name: 'TARGET_LANGUAGE', value: opts.language.toString() },
          { name: 'SFN_TASK_TOKEN', value: JsonPath.taskToken },
        ],
      }],
      integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      launchTarget: new EcsFargateLaunchTarget({ platformVersion: FargatePlatformVersion.VERSION1_4 }),
      subnets: opts.vpcSubnets,
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
   * The language into which the transliteration should be made.
   */
  readonly language: DocumentationLanguage;

  /**
   * VPC Subnet placement options, if relevant.
   */
  readonly vpcSubnets?: SubnetSelection;
}
