import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { metricScope, Unit } from 'aws-embedded-metrics';
import type { Context } from 'aws-lambda';
import { MetricName, METRICS_NAMESPACE } from './constants';
import { CacheStrategy } from '../../caching';
import { S3_CLIENT } from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';

interface ProcessorResult {
  chunkIndex: number;
  chunkKey: string;
  packageCount: number;
}

interface StepFunctionEvent {
  processResults: Array<{
    Payload: ProcessorResult;
  }>;
}

export async function handler(event: StepFunctionEvent, context: Context) {
  const STATS_BUCKET_NAME = requireEnv('STATS_BUCKET_NAME');
  const STATS_OBJECT_KEY = requireEnv('STATS_OBJECT_KEY');

  const results = event.processResults.map((r) => r.Payload);
  console.log(`Aggregating ${results.length} chunks`);

  const currentDate = new Date().toISOString();
  const aggregatedStats: { [key: string]: { downloads: { npm: number } } } = {};
  let failedChunks = 0;

  // Read and aggregate all chunk results
  for (const result of results) {
    // Skip results that have errors (failed chunks)
    if ('error' in result) {
      console.warn(`Skipping failed chunk ${result.chunkIndex}`);
      failedChunks++;
      continue;
    }

    try {
      const response = await S3_CLIENT.send(
        new GetObjectCommand({
          Bucket: STATS_BUCKET_NAME,
          Key: result.chunkKey,
        })
      );

      const chunkData = JSON.parse(await response.Body!.transformToString());
      Object.assign(aggregatedStats, chunkData);

      // Clean up chunk file
      await S3_CLIENT.send(
        new DeleteObjectCommand({
          Bucket: STATS_BUCKET_NAME,
          Key: result.chunkKey,
        })
      );
    } catch (error) {
      console.error(`Failed to process chunk ${result.chunkIndex}:`, error);
      failedChunks++;
    }
  }

  const finalStats = {
    packages: aggregatedStats,
    updated: currentDate,
  };

  const statsCount = Object.keys(aggregatedStats).length;
  console.log(
    `Aggregated stats for ${statsCount} packages (${failedChunks} chunks failed)`
  );

  if (failedChunks > 0) {
    console.warn(
      `Warning: ${failedChunks} chunks failed, stats may be incomplete`
    );
  }

  // Update metrics
  await metricScope((metrics) => async () => {
    metrics.setDimensions({});
    metrics.setNamespace(METRICS_NAMESPACE);
    metrics.putMetric(
      MetricName.REGISTERED_PACKAGES_WITH_STATS,
      statsCount,
      Unit.Count
    );
  })();

  // Upload final stats to S3
  await S3_CLIENT.send(
    new PutObjectCommand({
      Bucket: STATS_BUCKET_NAME,
      Key: STATS_OBJECT_KEY,
      Body: JSON.stringify(finalStats, null, 2),
      ContentType: 'application/json',
      CacheControl: CacheStrategy.default().toString(),
      Metadata: {
        'Lambda-Log-Group': context.logGroupName,
        'Lambda-Log-Stream': context.logStreamName,
        'Lambda-Run-Id': context.awsRequestId,
        'Package-Stats-Count': `${statsCount}`,
      },
    })
  );

  // Fail the state machine if any chunks failed
  if (failedChunks > 0) {
    throw new Error(`${failedChunks} chunks failed during processing`);
  }
}
