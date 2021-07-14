import { ComparisonOperator, IAlarm } from '@aws-cdk/aws-cloudwatch';
import { GatewayVpcEndpoint, InterfaceVpcEndpoint, IVpc, SubnetSelection, SubnetType } from '@aws-cdk/aws-ec2';
import { SnsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Bucket, EventType } from '@aws-cdk/aws-s3';
import * as s3n from '@aws-cdk/aws-s3-notifications';
import * as sns from '@aws-cdk/aws-sns';
import { Construct, Duration, Fn } from '@aws-cdk/core';
import { Repository } from '../../codeartifact/repository';
import { Monitoring } from '../../monitoring';
import * as s3 from '../../s3';
import * as constants from '../shared/constants';
import { DocumentationLanguage } from '../shared/language';
import { Transliterator as Handler } from './transliterator';

const SUPPORTED_LANGUAGES = [DocumentationLanguage.PYTHON, DocumentationLanguage.TYPESCRIPT];

export interface TransliteratorProps {
  /**
   * The bucket in which to source assemblies to transliterate.
   */
  readonly bucket: Bucket;

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
  /**
   * Alarms if the dead-letter-queue associated with the transliteration process
   * is not empty, meaning some packages failed transliteration and require
   * operator attention.
   */
  public readonly alarmsDeadLetterQueueNotEmpty: Map<DocumentationLanguage, IAlarm>;

  public constructor(scope: Construct, id: string, props: TransliteratorProps) {
    super(scope, id);
    this.alarmsDeadLetterQueueNotEmpty = new Map();

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

    const topic = new sns.Topic(this, 'Topic');

    // multiplex the event via an sns topic so that all functions get it
    bucket.addEventNotification(EventType.OBJECT_CREATED, new s3n.SnsDestination(topic), {
      prefix: constants.STORAGE_KEY_PREFIX,
      suffix: constants.ASSEMBLY_KEY_SUFFIX,
    });

    for (const lang of SUPPORTED_LANGUAGES) {

      const lambda = new Handler(this, 'Default', {
        deadLetterQueueEnabled: true,
        description: 'Creates transliterated assemblies from jsii-enabled npm packages',
        environment: { ...environment, language: lang.toString() },
        logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
        memorySize: 10_240, // Currently the maximum possible setting
        retryAttempts: 2,
        timeout: Duration.minutes(15),
        vpc: props.vpc,
        vpcSubnets: props.vpcSubnets ?? { subnetType: SubnetType.ISOLATED },
      });

      repository?.grantReadFromRepository(lambda);

      // The handler reads & writes to this bucket.
      bucket.grantRead(lambda, `${constants.STORAGE_KEY_PREFIX}*${constants.ASSEMBLY_KEY_SUFFIX}`);
      bucket.grantWrite(lambda, `${constants.STORAGE_KEY_PREFIX}*${constants.DOCS_KEY_SUFFIX_ANY}`);

      // subscribe to the topic
      lambda.addEventSource(new SnsEventSource(topic, { deadLetterQueue: lambda.deadLetterQueue }));

      props.monitoring.watchful.watchLambdaFunction('Transliterator Function', lambda);
      this.alarmsDeadLetterQueueNotEmpty.set(lang, lambda.deadLetterQueue!.metricApproximateNumberOfMessagesVisible()
        .createAlarm(this, 'DLQAlarm', {
          alarmDescription: 'The transliteration function failed for one or more packages',
          comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          evaluationPeriods: 1,
          threshold: 1,
        }));
    }

  }

}
