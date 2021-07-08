import { ComparisonOperator, IAlarm } from '@aws-cdk/aws-cloudwatch';
import { S3EventSource } from '@aws-cdk/aws-lambda-event-sources';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Bucket, EventType } from '@aws-cdk/aws-s3';
import { Construct, Duration } from '@aws-cdk/core';

import { Monitoring } from '../../monitoring';
import * as constants from '../shared/constants';
import { CatalogBuilder as Handler } from './catalog-builder';

export interface CatalogBuilderProps {
  /**
   * The package store bucket.
   */
  readonly bucket: Bucket;

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
 * Builds or re-builds the `catalog.json` object in the designated bucket.
 */
export class CatalogBuilder extends Construct {
  /**
   * Alarms when the dead-letter-queue associated with the catalog builder
   * function is not empty, meaning the catalog builder failed to run and
   * requires operator attention.
   */
  public readonly alarmDeadLetterQueueNotEmpty: IAlarm;

  public constructor(scope: Construct, id: string, props: CatalogBuilderProps) {
    super(scope, id);

    const handler = new Handler(this, 'Default', {
      deadLetterQueueEnabled: true,
      description: `Creates the catalog.json object in ${props.bucket.bucketName}`,
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
      },
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 10_240, // Currently the maximum possible setting
      reservedConcurrentExecutions: 1,
      timeout: Duration.minutes(15),
    });

    props.bucket.grantReadWrite(handler);

    handler.addEventSource(new S3EventSource(props.bucket, {
      events: [EventType.OBJECT_CREATED],
      filters: [{ prefix: constants.STORAGE_KEY_PREFIX, suffix: constants.docsKeySuffix('ts') }],
    }));

    props.monitoring.watchful.watchLambdaFunction('Catalog Builder Function', handler);
    this.alarmDeadLetterQueueNotEmpty = handler.deadLetterQueue!.metricApproximateNumberOfMessagesVisible()
      .createAlarm(this, 'DLQAlarm', {
        alarmDescription: 'The catalog builder function failed to run',
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
      });
  }
}
