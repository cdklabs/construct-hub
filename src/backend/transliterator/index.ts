import { ComparisonOperator, IAlarm } from '@aws-cdk/aws-cloudwatch';
import { GatewayVpcEndpoint, InterfaceVpcEndpoint, IVpc, SubnetSelection, SubnetType } from '@aws-cdk/aws-ec2';
import { S3EventSource } from '@aws-cdk/aws-lambda-event-sources';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Bucket, EventType } from '@aws-cdk/aws-s3';
import { Construct, Duration, Fn } from '@aws-cdk/core';
import { Repository } from '../../codeartifact/repository';
import { Monitoring } from '../../monitoring';
import * as s3 from '../../s3';
import * as constants from '../shared/constants';
import { Transliterator as Handler } from './transliterator';

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
  public readonly alarmDeadLetterQueueNotEmpty: IAlarm;

  public constructor(scope: Construct, id: string, props: TransliteratorProps) {
    super(scope, id);

    const environment: Record<string, string> = {};
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

    const lambda = new Handler(this, 'Default', {
      deadLetterQueueEnabled: true,
      description: 'Creates transliterated assemblies from jsii-enabled npm packages',
      environment,
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 10_240, // Currently the maximum possible setting
      retryAttempts: 2,
      timeout: Duration.minutes(15),
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets ?? { subnetType: SubnetType.ISOLATED },
    });

    const repository = props.vpcEndpoints
      ? props.codeArtifact?.throughVpcEndpoint(props.vpcEndpoints.codeArtifactApi, props.vpcEndpoints.codeArtifact)
      : props.codeArtifact;
    repository?.grantReadFromRepository(lambda);

    const bucket = props.vpcEndpoints
      ? s3.throughVpcEndpoint(props.bucket, props.vpcEndpoints.s3)
      : props.bucket;
    // The handler reads & writes to this bucket.
    bucket.grantRead(lambda, `${constants.STORAGE_KEY_PREFIX}*${constants.PACKAGE_KEY_SUFFIX}`);
    bucket.grantWrite(lambda, `${constants.STORAGE_KEY_PREFIX}*${constants.assemblyKeySuffix('*')}`);

    // Creating the event chaining
    lambda.addEventSource(new S3EventSource(props.bucket, {
      events: [EventType.OBJECT_CREATED],
      filters: [{ prefix: constants.STORAGE_KEY_PREFIX, suffix: constants.PACKAGE_KEY_SUFFIX }],
    }));

    props.monitoring.watchful.watchLambdaFunction('Transliterator Function', lambda);
    this.alarmDeadLetterQueueNotEmpty = lambda.deadLetterQueue!.metricApproximateNumberOfMessagesVisible()
      .createAlarm(this, 'DLQAlarm', {
        alarmDescription: 'The transliteration function failed for one or more packages',
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
      });
  }
}
