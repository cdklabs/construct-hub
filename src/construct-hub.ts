import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { BlockPublicAccess } from '@aws-cdk/aws-s3';
import * as sqs from '@aws-cdk/aws-sqs';
import { Construct as CoreConstruct, Duration } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { AlarmActions, Domain } from './api';
import { CatalogBuilder, Discovery, Ingestion, DocGenerator } from './backend';
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

    this.ingestion = new Ingestion(this, 'Ingestion', { bucket: packageData, monitoring });

    const discovery = new Discovery(this, 'Discovery', { queue: this.ingestion.queue, monitoring });
    discovery.bucket.grantRead(this.ingestion);

    new DocGenerator(this, 'DocGenerator', { bucket: packageData, monitoring });
    new CatalogBuilder(this, 'CatalogBuilder', { bucket: packageData, monitoring });

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
