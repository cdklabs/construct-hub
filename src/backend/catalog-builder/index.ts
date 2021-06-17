import { S3EventSource } from '@aws-cdk/aws-lambda-event-sources';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { Bucket, EventType } from '@aws-cdk/aws-s3';
import { Construct, Duration } from '@aws-cdk/core';

import { constants } from '../shared';
import { CatalogBuilder as Handler } from './catalog-builder';

export interface CatalogBuilderProps {
  /**
   * The package store bucket.
   */
  readonly bucket: Bucket;

  /**
   * How long should execution logs be retained?
   *
   * @default RetentionDays.TEN_YEARS
   */
  readonly logRetention?: RetentionDays;
}

export class CatalogBuilder extends Construct {
  public constructor(scope: Construct, id: string, props: CatalogBuilderProps) {
    super(scope, id);

    const handler = new Handler(this, 'Default', {
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
      filters: [{ prefix: constants.STORAGE_KEY_PREFIX, suffix: constants.ASSEMBLY_KEY_SUFFIX }],
    }));
  }
}
