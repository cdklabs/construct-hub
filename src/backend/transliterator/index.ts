import { GatewayVpcEndpoint, InterfaceVpcEndpoint, IVpc, SubnetSelection, SubnetType } from '@aws-cdk/aws-ec2';
import { IFunction, Tracing } from '@aws-cdk/aws-lambda';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { IBucket } from '@aws-cdk/aws-s3';
import { Construct, Duration, Fn } from '@aws-cdk/core';
import { Repository } from '../../codeartifact/repository';
import { Monitoring } from '../../monitoring';
import * as s3 from '../../s3';
import * as constants from '../shared/constants';
import { DocumentationLanguage } from '../shared/language';
import { Transliterator as Handler } from './transliterator';

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
  readonly vpc?: IVpc;

  /**
   * VPC endpoints to use for interacting with CodeArtifact and S3.
   */
  readonly vpcEndpoints?: TransliteratorVpcEndpoints;

  /**
   * The subnet selection to use for placement of the Lambda function.
   *
   * @default { subnetType: SubnetType.ISOLATED }
   */
  readonly vpcSubnets?: SubnetSelection;

  /**
   * How long should execution logs be retained?
   *
   * @default RetentionDays.TEN_YEARS
   */
  readonly logRetention?: RetentionDays;
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
   * The VPC endpoint for the S3
   */
  readonly s3: GatewayVpcEndpoint;
}

/**
 * Transliterates jsii assemblies to various other languages.
 */
export class Transliterator extends Construct {
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
      environment: { ...environment, TARGET_LANGUAGE: props.language.toString() },
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 10_240, // Currently the maximum possible setting
      timeout: Duration.minutes(15),
      tracing: Tracing.PASS_THROUGH,
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets ?? { subnetType: SubnetType.ISOLATED },
    });
    this.function = lambda;

    repository?.grantReadFromRepository(this.function);

    // The handler reads & writes to this bucket.
    bucket.grantRead(this.function, `${constants.STORAGE_KEY_PREFIX}*${constants.ASSEMBLY_KEY_SUFFIX}`);
    bucket.grantWrite(this.function, `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(props.language)}`);
    bucket.grantWrite(this.function, `${constants.STORAGE_KEY_PREFIX}*${constants.docsKeySuffix(props.language)}${constants.NOT_SUPPORTED_SUFFIX}`);

    props.monitoring.watchful.watchLambdaFunction('Transliterator Function', lambda);
  }

}
