import { Configuration, metricScope, Unit } from 'aws-embedded-metrics';
import Environments from 'aws-embedded-metrics/lib/environment/Environments';
import * as AWS from 'aws-sdk';
import * as clients from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';
import { DenyListClient } from './client.lambda-shared';
import { ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME, ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX, ENV_PRUNE_QUEUE_URL, MetricName, METRICS_NAMESPACE } from './constants';

const s3 = clients.s3();
const sqs = clients.sqs();

// Configure embedded metrics format
Configuration.environmentOverride = Environments.Lambda;
Configuration.namespace = METRICS_NAMESPACE;

export async function handler(event: unknown) {
  console.log(`Event: ${JSON.stringify(event)}`);

  const client = await DenyListClient.newClient();

  await metricScope((metrics) => async () => {
    metrics.setDimensions();

    const ruleCount = Object.keys(client.map).length;
    metrics.putMetric(MetricName.DENY_LIST_RULE_COUNT, ruleCount, Unit.Count);
  })();

  const packageData = requireEnv(ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME);
  const pruneQueue = requireEnv(ENV_PRUNE_QUEUE_URL);
  const keyPrefix = requireEnv(ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX);

  for (const nameVersion of Object.keys(client.map)) {
    const prefix = `${keyPrefix}${nameVersion}/`;
    console.log(`Querying bucket ${packageData} for all objects with prefix ${prefix}`);

    // for each prefix, query the package data bucket for all objects with that
    // prefix and delete them
    let continuation = undefined;
    do {
      const req: AWS.S3.ListObjectsV2Request = {
        Bucket: packageData,
        Prefix: prefix,
        ContinuationToken: continuation,
      };

      const result = await s3.listObjectsV2(req).promise();
      continuation = result.NextContinuationToken;

      // queue all objects for deletion
      for (const object of result.Contents ?? []) {
        if (!object.Key) {
          continue;
        }
        const sendMessageRequest: AWS.SQS.SendMessageRequest = {
          QueueUrl: pruneQueue,
          MessageBody: object.Key,
        };

        console.log(JSON.stringify({ sendMessageRequest }));
        const sendMessageResponse = await sqs.sendMessage(sendMessageRequest).promise();
        console.log(JSON.stringify({ sendMessageResponse }));
      }

    } while (continuation);
  }
}