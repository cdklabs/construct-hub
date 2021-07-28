import { GatewayVpcEndpoint, InterfaceVpcEndpoint, IVpc, Port, SubnetSelection } from '@aws-cdk/aws-ec2';
import { IAccessPoint } from '@aws-cdk/aws-efs';
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { CfnFunction, IFunction, Tracing } from '@aws-cdk/aws-lambda';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { IBucket } from '@aws-cdk/aws-s3';
import { Construct, Duration, Fn } from '@aws-cdk/core';
import { Repository } from '../../codeartifact/repository';
import { Monitoring } from '../../monitoring';
import * as s3 from '../../s3';
import * as constants from '../shared/constants';
import { DocumentationLanguage } from '../shared/language';
import { Transliterator as Handler } from './transliterator';

const EFS_MOUNT_PATH = '/mnt/efs';

export interface TransliteratorProps {
  /**
   * The bucket in which to source assemblies to transliterate.
   */
  readonly bucket: IBucket;

  /**
   * The language to generate documentation for.
   */
  readonly language: DocumentationLanguage;

  /**
   * The CodeArtifact registry to use for regular operations.
   */
  readonly codeArtifact?: Repository;

  /**
   * The monitoring handler to register alarms with.
   */
  readonly monitoring: Monitoring;

  /**
   * The VPC in which isolated lambda functions will reside.
   */
  readonly vpc: IVpc;

  /**
   * The subnet selection to use for placement of the Lambda function.
   */
  readonly vpcSubnets?: SubnetSelection;

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

  /**
   * An optional EFS Access Point to use for allowing to work with larger
   * packages, which otherwise would exceed Lambda's 512MB writable storage
   * limit.
   */
  readonly efsAccessPoint: IAccessPoint;
}

export interface TransliteratorVpcEndpoints {
  /**
   * The VPC endpoint for the CodeArtifact API (service: 'codeartifact.api')
   */
  readonly codeArtifactApi: InterfaceVpcEndpoint;

  /**
   * The VPC endpoint for the CodeArtifact repositories (service: 'codeartifact.repositories')
   */
  readonly codeArtifact: InterfaceVpcEndpoint;

  /**
   * The VPC endpoint for the Elastic File System service.
   */
  readonly elasticFileSystem: InterfaceVpcEndpoint;

  /**
   * The VPC endpoint for the S3
   */
  readonly s3: GatewayVpcEndpoint;
}

/**
 * Transliterates jsii assemblies to various other languages.
 */
export class Transliterator extends Construct {
  /**
   * The path under which the npm cache will be located, within the EFS mount.
   */
  public static readonly SHARED_NPM_CACHE_PATH = '/npm-cache';

  public readonly function: IFunction

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
      TARGET_LANGUAGE: props.language.toString(),
      // Override $TMPDIR to be on the EFS volume (so we are not limited to 512MB)
      TMPDIR: EFS_MOUNT_PATH,
      // Configure a fixed directory in the EFS volume where we share npm caches
      NPM_CACHE: `${EFS_MOUNT_PATH}${Transliterator.SHARED_NPM_CACHE_PATH}`,
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

    const lambda = new Handler(this, 'Resource', {
      description: `Creates ${props.language} documentation from jsii-enabled npm packages`,
      environment,
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 10_240, // Currently the maximum possible setting
      timeout: Duration.minutes(15),
      tracing: Tracing.PASS_THROUGH,
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets,
    });
    this.function = lambda;

    // TODO: The @aws-cdk/aws-lambda library does not support EFS mounts yet T_T
    (lambda.node.defaultChild as CfnFunction).addPropertyOverride('FileSystemConfigs', [{
      Arn: props.efsAccessPoint.accessPointArn,
      LocalMountPath: EFS_MOUNT_PATH,
    }]);

    props.efsAccessPoint.fileSystem.connections.allowFrom(lambda, Port.allTraffic());

    if (props.vpcEndpoints) {
      props.vpcEndpoints.elasticFileSystem.addToPolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['elasticfilesystem:ClientMount', 'elasticfilesystem:ClientWrite'],
        conditions: {
          Bool: { 'aws:SecureTransport': 'true' },
          ArnEquals: { 'elasticfilesystem:AccessPointArn': props.efsAccessPoint.accessPointArn },
        },
        principals: [lambda.grantPrincipal],
        resources: [props.efsAccessPoint.fileSystem.fileSystemArn],
      }));
    }

    repository?.grantReadFromRepository(this.function);

    // The handler reads & writes to this bucket.
    bucket.grantRead(this.function, `${constants.STORAGE_KEY_PREFIX}*${constants.ASSEMBLY_KEY_SUFFIX}`);
    bucket.grantWrite(this.function, `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(props.language)}`);
    bucket.grantWrite(this.function, `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(props.language, '*')}`);
    bucket.grantWrite(this.function, `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(props.language)}${constants.NOT_SUPPORTED_SUFFIX}`);
    bucket.grantWrite(this.function, `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(props.language, '*')}${constants.NOT_SUPPORTED_SUFFIX}`);
  }

}
