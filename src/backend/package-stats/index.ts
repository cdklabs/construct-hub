import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import { Tracing } from '@aws-cdk/aws-lambda';
import { RetentionDays } from '@aws-cdk/aws-logs';
import type { IBucket } from '@aws-cdk/aws-s3';
import { Construct, Duration } from '@aws-cdk/core';
import { Monitoring } from '../../monitoring';
import { PackageStats as Handler } from './package-stats';

export interface PackageStatsProps {
  /**
   * The package store bucket, which should include both the
   * catalog and stats.
   */
  readonly bucket: IBucket;

  /**
   * The monitoring handler to register alarms with.
   */
  readonly monitoring: Monitoring;

  /**
   * How long should execution logs be retained?
   *
   * @default RetentionDays.TEN_YEARS
   */
  readonly logRetention?: RetentionDays;
}

/**
 * Builds or re-builds the `stats.json` object in the designated bucket.
 */
export class PackageStats extends Construct {
  public constructor(scope: Construct, id: string, props: PackageStatsProps) {
    super(scope, id);

    const handler = new Handler(this, 'Default', {
      description: `Creates the stats.json object in ${props.bucket.bucketName}`,
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
      },
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 256,
      reservedConcurrentExecutions: 1,
      timeout: Duration.minutes(15),
      tracing: Tracing.PASS_THROUGH,
    });

    const rule = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.cron({ hour: '6' }), // daily at 6am in some timezone
    });
    rule.addTarget(new targets.LambdaFunction(handler));

    props.bucket.grantReadWrite(handler);
  }
}
