import { metricScope, Unit } from 'aws-embedded-metrics';
import { Context, S3Event } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { requireEnv } from '../../backend/shared/env.lambda-shared';
import { METRICS_NAMESPACE, MetricName } from './constants';

const DISTRIBUTION_ID = requireEnv('DISTRIBUTION_ID');
const PATH_PREFIX = requireEnv('PATH_PREFIX');

export async function handler(event: S3Event, context: Context) {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  if (event.Records.length === 0) {
    return;
  }

  await metricScope((metrics) => () => {
    // Clear default dimensions, we don't need those.
    metrics.setDimensions();

    metrics.setNamespace(METRICS_NAMESPACE);

    const now = Date.now();
    for (const record of event.Records) {
      const age = now - new Date(record.eventTime).getTime();
      metrics.putMetric(MetricName.S3_EVENT_AGE, age, Unit.Milliseconds);
    }
  })();

  const cf = new AWS.CloudFront();
  const invalidationRequet: AWS.CloudFront.CreateInvalidationRequest = {
    DistributionId: DISTRIBUTION_ID,
    InvalidationBatch: {
      Paths: {
        Quantity: event.Records.length,
        Items: event.Records.map((record) => `${PATH_PREFIX}${record.s3.object.key}`),
      },
      CallerReference: context.awsRequestId,
    },
  };
  console.log(JSON.stringify({ invalidationRequet }));
  const invalidationResponse = cf.createInvalidation(invalidationRequet).promise();
  console.log(JSON.stringify({ invalidationResponse }));
  return invalidationResponse;
}
