import * as s3 from '@aws-cdk/aws-s3';
import { Queue } from '@aws-cdk/aws-sqs';
import { Construct as CoreConstruct, Duration } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { AlarmActions, Domain } from './api';
import { Transliterator } from './backend';
import { DiscoveryFunction } from './backend/discovery';
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
export class ConstructHub extends CoreConstruct {
  public constructor(scope: Construct, id: string, props: ConstructHubProps) {
    super(scope, id);

    const monitoring = new Monitoring(this, 'Monitoring', {
      alarmActions: props.alarmActions,
      dashboardName: props.dashboardName ?? 'construct-hub',
    });

    const packageData = new s3.Bucket(this, 'PackageData', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
    });

    const stagingBucket = new s3.Bucket(this, 'StagingBucket', {
      lifecycleRules: [
        {
          prefix: 'packages', // delete the staged tarball after 30 days
          expiration: Duration.days(30),
        },
      ],
    });

    const ingestionQueue = new Queue(this, 'IngestionQueue');

    new DiscoveryFunction(this, 'DiscoveryFunction', {
      queue: ingestionQueue,
      stagingBucket,
    });

    new Transliterator(this, 'Transliterator', {
      sourceBucket: packageData,
    });

    new WebApp(this, 'WebApp', {
      domain: props.domain,
      monitoring: monitoring,
    });
  }
}
