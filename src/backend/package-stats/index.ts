import { Duration } from 'aws-cdk-lib';
import {
  ComparisonOperator,
  Metric,
  MetricOptions,
  Statistic,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { IFunction, Tracing } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { MetricName, METRICS_NAMESPACE } from './constants';
import { PackageStatsAggregator } from './package-stats-aggregator';
import { PackageStatsChunker } from './package-stats-chunker';
import { PackageStatsProcessor } from './package-stats-processor';

import { Monitoring } from '../../monitoring';
import { RUNBOOK_URL } from '../../runbook-url';
import { CATALOG_KEY } from '../shared/constants';

/**
 * Props for `PackageStats`.
 */
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

  /**
   * How frequently should the stats be updated?
   *
   * NPM updates their download stats once a day.
   *
   * @default - 1 day
   */
  readonly updatePeriod?: Duration;

  /**
   * The key of the object storing the package stats.
   */
  readonly objectKey: string;

  /**
   * Number of packages to process per chunk.
   *
   * @default 100
   */
  readonly chunkSize?: number;
}

/**
 * Builds or re-builds the `stats.json` object in the designated bucket.
 */
export class PackageStats extends Construct {
  /**
   * The package store bucket, which should include both the
   * catalog and stats.
   */
  public readonly bucket: IBucket;

  /**
   * The Step Functions state machine that orchestrates stats processing.
   */
  public readonly stateMachine: sfn.StateMachine;

  /**
   * The Lambda functions used in the state machine.
   */
  public readonly chunkerFunction: IFunction;
  public readonly processorFunction: IFunction;
  public readonly aggregatorFunction: IFunction;

  /**
   * The key of the object storing the package stats.
   */
  public readonly statsKey: string;

  public constructor(scope: Construct, id: string, props: PackageStatsProps) {
    super(scope, id);

    this.bucket = props.bucket;
    this.statsKey = props.objectKey;

    const commonEnv = {
      CATALOG_BUCKET_NAME: this.bucket.bucketName,
      CATALOG_OBJECT_KEY: CATALOG_KEY,
      STATS_BUCKET_NAME: this.bucket.bucketName,
      STATS_OBJECT_KEY: props.objectKey,
      CHUNK_SIZE: (props.chunkSize ?? 100).toString(),
    };

    // Create Lambda functions
    this.chunkerFunction = new PackageStatsChunker(this, 'Chunker', {
      description: 'Splits package list into chunks for parallel processing',
      environment: commonEnv,
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      timeout: Duration.minutes(5),
      tracing: Tracing.PASS_THROUGH,
    });

    this.processorFunction = new PackageStatsProcessor(this, 'Processor', {
      description: 'Processes a chunk of packages to get NPM stats',
      environment: commonEnv,
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      memorySize: 1024,
      timeout: Duration.minutes(10),
      tracing: Tracing.PASS_THROUGH,
    });

    this.aggregatorFunction = new PackageStatsAggregator(this, 'Aggregator', {
      description: 'Aggregates processed chunks into final stats.json',
      environment: commonEnv,
      logRetention: props.logRetention ?? RetentionDays.TEN_YEARS,
      timeout: Duration.minutes(5),
      tracing: Tracing.PASS_THROUGH,
    });

    // Grant S3 permissions
    this.bucket.grantReadWrite(this.chunkerFunction);
    this.bucket.grantReadWrite(this.processorFunction);
    this.bucket.grantReadWrite(this.aggregatorFunction);

    // Create Step Functions state machine
    const chunkPackages = new tasks.LambdaInvoke(this, 'ChunkPackages', {
      lambdaFunction: this.chunkerFunction,
      resultPath: '$.chunks',
    });

    const processChunksMap = new sfn.Map(this, 'ProcessChunksMap', {
      itemsPath: '$.chunks.Payload.chunks',
      maxConcurrency: 10,
      resultPath: '$.processResults',
    });

    processChunksMap.itemProcessor(
      new tasks.LambdaInvoke(this, 'ProcessChunk', {
        lambdaFunction: this.processorFunction,
        inputPath: '$',
      })
        .addRetry({
          errors: ['States.ALL'],
          maxAttempts: 1,
          backoffRate: 1,
          interval: Duration.minutes(5),
        })
        .addCatch(
          new sfn.Pass(this, 'ProcessChunkError', {
            result: sfn.Result.fromObject({ error: 'Failed to process chunk' }),
          }),
          {
            resultPath: '$.error',
          }
        )
    );

    const aggregateResults = new tasks.LambdaInvoke(this, 'AggregateResults', {
      lambdaFunction: this.aggregatorFunction,
      inputPath: '$',
    });

    const definition = chunkPackages
      .next(processChunksMap)
      .next(aggregateResults);

    this.stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definition,
      timeout: Duration.hours(6),
    });

    // Schedule the state machine
    const updatePeriod = props.updatePeriod ?? Duration.days(1);
    const rule = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.rate(updatePeriod),
    });
    rule.addTarget(new targets.SfnStateMachine(this.stateMachine));

    // Create alarms
    const failureAlarm = this.stateMachine
      .metricFailed()
      .createAlarm(scope, 'PackageStats/Failures', {
        alarmName: `${scope.node.path}/PackageStats/Failures`,
        alarmDescription: [
          'The package stats state machine failed!',
          '',
          `RunBook: ${RUNBOOK_URL}`,
        ].join('\n'),
        comparisonOperator:
          ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 1,
        treatMissingData: TreatMissingData.MISSING,
      });
    props.monitoring.addLowSeverityAlarm('PackageStats Failures', failureAlarm);
  }

  public metricPackagesCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.REGISTERED_PACKAGES_WITH_STATS,
      namespace: METRICS_NAMESPACE,
    });
  }
}
