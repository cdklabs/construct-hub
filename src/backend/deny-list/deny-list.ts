import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import { Function } from '@aws-cdk/aws-lambda';
import { S3EventSource } from '@aws-cdk/aws-lambda-event-sources';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import { Construct as CoreConstruct, Duration } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { DenyListRule } from './api';
import { ENV_DENY_LIST_BUCKET_NAME, ENV_DENY_LIST_OBJECT_KEY } from './constants';
import { Prune } from './prune';

/**
 * Props for `DenyList`.
 */
export interface DenyListProps {
  /**
   * The deny list.
   * @default []
   */
  readonly rules?: DenyListRule[];

  /**
   * The S3 bucket that includes the package data.
   */
  readonly packageDataBucket: s3.Bucket;

  /**
   * The S3 key prefix for all package data.
   */
  readonly packageDataKeyPrefix: string;

  /**
   * Triggers prune when deny list changes.
   * @default true
   */
  readonly pruneOnChange?: boolean;

  /**
   * Prunes all S3 objects that are in the deny list periodically.
   *
   * Set to `Duration.zero` to disable
   *
   * @default Duration.minutes(5)
   */
  readonly prunePeriod?: Duration;
}

/**
 * Manages the construct hub deny list.
 */
export class DenyList extends CoreConstruct {
  /**
   * The S3 bucket that contains the deny list.
   */
  public readonly bucket: s3.Bucket;

  /**
   * The object key within the bucket with the deny list JSON file.
   */
  public readonly fileName: string;

  constructor(scope: Construct, id: string, props: DenyListProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
    });

    this.fileName = 'deny-list.json';
    const directory = this.writeToFile(props.rules ?? [], this.fileName);

    // upload the deny list to the bucket
    const upload = new s3deploy.BucketDeployment(this, 'BucketDeployment', {
      destinationBucket: this.bucket,
      sources: [s3deploy.Source.asset(directory)],
    });

    const prune = new Prune(this, 'Prune', {
      packageDataBucket: props.packageDataBucket,
      packageDataKeyPrefix: props.packageDataKeyPrefix,
    });

    this.grantRead(prune.handler);

    // trigger prune when the deny list changes
    const pruneOnChange = props.pruneOnChange ?? true;
    if (pruneOnChange) {
      prune.handler.addEventSource(new S3EventSource(this.bucket, {
        events: [s3.EventType.OBJECT_CREATED],
        filters: [{ prefix: this.fileName }],
      }));
    }

    // trigger prune periodically (every 5 minutes) - just in case
    const prunePeriod = props.prunePeriod ?? Duration.minutes(5);
    if (prunePeriod) {
      new events.Rule(this, 'PeriodicPrune', {
        schedule: events.Schedule.rate(prunePeriod),
        targets: [new targets.LambdaFunction(prune.handler)],
      });
    }

    // add an explicit dep between upload and the bucket scope which can now
    // also include the bucket notification resource. otherwise, the first
    // upload will not trigger a prune
    upload.node.addDependency(this.bucket);
  }

  /**
   * Grants an AWS Lambda function permissions to read the deny list.
   */
  public grantRead(handler: Function) {
    handler.addEnvironment(ENV_DENY_LIST_BUCKET_NAME, this.bucket.bucketName);
    handler.addEnvironment(ENV_DENY_LIST_OBJECT_KEY, this.fileName);
    this.bucket.grantRead(handler);
  }

  /**
   * Writes the deny list to a temporary file and returns a path to a directory
   * with the JSON file. The contents of the JSON file is a map where keys are
   * package names (and optionally, version) and the value is the deny list
   * entry. This makes it easier to query by the service.
   *
   * Also performs some validation to make sure there are no duplicate entries.
   *
   * @param list The deny list
   * @returns a path to a temporary directory that can be deployed to S3
   */
  private writeToFile(list: DenyListRule[], fileName: string): string {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'deny-list-'));
    const filePath = path.join(tmpdir, fileName);
    const map: { [nameVersion: string]: DenyListRule } = {};
    for (const entry of list) {
      const versionSuffix = entry.version ? `/v${entry.version}` : '';
      const key = `${entry.package}${versionSuffix}`;
      if (key in map) {
        throw new Error(`Duplicate deny list entry: ${key}`);
      }

      map[key] = entry;
    }
    fs.writeFileSync(filePath, JSON.stringify(map, null, 2));
    return tmpdir;
  }
}
