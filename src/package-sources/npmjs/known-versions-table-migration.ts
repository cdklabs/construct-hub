import { Duration } from 'aws-cdk-lib';
import { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { CfnFunction, Function, Tracing } from 'aws-cdk-lib/aws-lambda';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { InvocationType, Trigger } from 'aws-cdk-lib/triggers';
import { Construct } from 'constructs';
import {
  ENV_KNOWN_VERSIONS_TABLE_NAME,
  KNOWN_VERSIONS_FILE_NAME,
  MARKER_FILE_NAME,
} from './constants.lambda-shared';
import { KnownVersionsMigration } from './known-versions-migration';

export interface KnownVersionsTableMigrationProps {
  /** The bucket holding the known versions file. */
  readonly bucket: IBucket;

  /** The table to copy the known versions to. */
  readonly table: ITableV2;

  /** The follower function, which is only updated once the copy completed. */
  readonly follower: Function;
}

/**
 * Copies the known versions of an existing deployment from the staging bucket
 * to the known versions table, when the table is created. The copy runs in two
 * passes:
 *
 * - Before the follower function is updated, so the new follower code never
 *   runs against an empty table. If this copy fails, the deployment fails and
 *   rolls back.
 * - After the follower function is updated, to pick up the versions the old
 *   follower code recorded in the file while the first copy ran.
 *
 * Copying is idempotent, so the second pass only adds what is missing.
 */
export class KnownVersionsTableMigration extends Construct {
  public constructor(
    scope: Construct,
    id: string,
    props: KnownVersionsTableMigrationProps
  ) {
    super(scope, id);

    const handler = new KnownVersionsMigration(this, 'Function', {
      description: `[${props.follower.node.path}] Copies the known versions from the staging bucket to the known versions table`,
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        [ENV_KNOWN_VERSIONS_TABLE_NAME]: props.table.tableName,
      },
      memorySize: 2_048,
      timeout: Duration.minutes(10),
      tracing: Tracing.ACTIVE,
    });
    props.bucket.grantRead(handler, KNOWN_VERSIONS_FILE_NAME);
    props.bucket.grantRead(handler, MARKER_FILE_NAME);
    props.table.grantWriteData(handler);

    // The function resource only, not the follower's whole scope (which may
    // contain this construct).
    const followerFunction = props.follower.node.defaultChild as CfnFunction;

    new Trigger(this, 'BeforeFollowerUpdate', {
      handler,
      invocationType: InvocationType.REQUEST_RESPONSE,
      // Longer than the function's own timeout (the trigger provider allows
      // up to 15 minutes).
      timeout: Duration.minutes(12),
      // Only when the trigger is created, not on later updates.
      executeOnHandlerChange: false,
      executeAfter: [props.table],
      executeBefore: [followerFunction],
    });

    new Trigger(this, 'AfterFollowerUpdate', {
      handler,
      // Nothing waits for this one; a failure is retried by Lambda.
      invocationType: InvocationType.EVENT,
      executeOnHandlerChange: false,
      executeAfter: [followerFunction],
    });
  }
}
