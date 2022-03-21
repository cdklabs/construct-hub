import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Metric, MetricOptions, Statistic } from '@aws-cdk/aws-cloudwatch';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import * as lambda from '@aws-cdk/aws-lambda';
import { S3EventSource } from '@aws-cdk/aws-lambda-event-sources';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import { Construct, Duration, IConstruct, RemovalPolicy } from '@aws-cdk/core';
import { Monitoring } from '../../monitoring';
import { OnCallDashboard } from '../../on-call-dashboard';
import { S3StorageFactory } from '../../s3/storage';
import { DenyListRule, IDenyList } from './api';
import { ENV_DENY_LIST_BUCKET_NAME, ENV_DENY_LIST_OBJECT_KEY, MetricName, METRICS_NAMESPACE } from './constants';
import { createDenyListMap } from './create-map';
import { Prune } from './prune';

/**
 * Props for `DenyList`.
 */
export interface DenyListProps {
  /**
   * A set of rules that are matched against package names and versions to
   * determine if they are blocked from displaying in the Construct Hub.
   *
   * An empty list will result in no packages being blocked.
   */
  readonly rules: DenyListRule[];

  /**
   * The S3 bucket that includes the package data.
   */
  readonly packageDataBucket: s3.IBucket;

  /**
   * The S3 key prefix for all package data.
   */
  readonly packageDataKeyPrefix: string;

  /**
   * Triggers prune when deny list changes.
   *
   * @default true
   */
  readonly pruneOnChange?: boolean;

  /**
   * Prunes all S3 objects that are in the deny list periodically.
   *
   * Use `Duration.minutes(0)` to disable periodical pruning.
   *
   * @default Duration.minutes(5)
   */
  readonly prunePeriod?: Duration;

  /**
   * The monitoring system.
   */
  readonly monitoring: Monitoring;

  readonly onCallDashboard: OnCallDashboard;
}

/**
 * Manages the construct hub deny list.
 */
export class DenyList extends Construct implements IDenyList {
  /**
   * The S3 bucket that contains the deny list.
   */
  public readonly bucket: s3.Bucket;

  /**
   * The object key within the bucket with the deny list JSON file.
   */
  public readonly objectKey = 'deny-list.json';

  /**
   * Responsible for deleting objects that match the deny list.
   */
  public readonly prune: Prune;

  /**
   * A construct which can be depended on to determine when the deny list has
   * been uploaded.
   */
  private readonly uploadReady: IConstruct;

  constructor(scope: Construct, id: string, props: DenyListProps) {
    super(scope, id);

    const storageFactory = S3StorageFactory.getOrCreate(this);

    this.bucket = storageFactory.newBucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
    });

    const directory = this.writeToFile(props.rules, this.objectKey);

    // upload the deny list to the bucket
    const upload = new s3deploy.BucketDeployment(this, 'BucketDeployment', {
      destinationBucket: this.bucket,
      prune: true,
      retainOnDelete: true,
      sources: [s3deploy.Source.asset(directory)],
    });
    this.uploadReady = upload.node.findChild('CustomResource');

    this.prune = new Prune(this, 'Prune', {
      packageDataBucket: props.packageDataBucket,
      packageDataKeyPrefix: props.packageDataKeyPrefix,
      monitoring: props.monitoring,
      onCallDashBoard: props.onCallDashboard,
    });

    this.grantRead(this.prune.pruneHandler);

    // trigger prune when the deny list changes
    const pruneOnChange = props.pruneOnChange ?? true;
    if (pruneOnChange) {
      this.prune.pruneHandler.addEventSource(new S3EventSource(this.bucket, {
        events: [s3.EventType.OBJECT_CREATED],
        filters: [{ prefix: this.objectKey, suffix: this.objectKey }],
      }));

      // Add an explicit dep between upload and the bucket notification. We are
      // not using the whole bucket scope to reduce the likelihood of a
      // dependency cycle.
      const notificationsReady = this.bucket.node.findChild('Notifications');
      this.uploadReady.node.addDependency(notificationsReady);
    }

    // trigger prune periodically (every 5 minutes) - just in case
    const prunePeriod = props.prunePeriod ?? Duration.minutes(5);
    if (prunePeriod && prunePeriod.toSeconds() > 0) {
      new events.Rule(this, 'PeriodicPrune', {
        schedule: events.Schedule.rate(prunePeriod),
        targets: [new targets.LambdaFunction(this.prune.pruneHandler)],
      });
    }
  }

  /**
   * Grants an AWS Lambda function permissions to read the deny list, and adds
   * the relevant environment variables expected by the `DenyListClient`.
   */
  public grantRead(handler: lambda.Function) {
    handler.addEnvironment(ENV_DENY_LIST_BUCKET_NAME, this.bucket.bucketName);
    handler.addEnvironment(ENV_DENY_LIST_OBJECT_KEY, this.objectKey);
    this.bucket.grantRead(handler);
  }

  /**
   * Number of rules in the deny list.
   */
  public metricDenyListRules(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.DENY_LIST_RULE_COUNT,
      namespace: METRICS_NAMESPACE,
    });
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
    const map = createDenyListMap(list);
    fs.writeFileSync(filePath, JSON.stringify(map, null, 2));
    return tmpdir;
  }
}
