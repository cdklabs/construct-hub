import { Configuration, metricScope, Unit } from 'aws-embedded-metrics';
import * as AWS from 'aws-sdk';
import * as clients from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';
import { DenyListClient } from './client.lambda-shared';
import { ENV_PRUNE_ON_CHANGE_FUNCTION_NAME, ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME, ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX, ENV_PRUNE_QUEUE_URL, MetricName, METRICS_NAMESPACE } from './constants';

const s3 = clients.s3();
const sqs = clients.sqs();
const lambda = clients.lambda();

// Configure embedded metrics format
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
  const objectsFound = new Array<string>();

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
        objectsFound.push(object.Key);
      }

    } while (continuation);

    // trigger the "on change" handler objects were found and we have a handler
    const onChangeFunctionName = process.env[ENV_PRUNE_ON_CHANGE_FUNCTION_NAME];
    if (onChangeFunctionName && objectsFound.length > 0) {
      console.log(`Triggering a on-change handler: ${onChangeFunctionName}`);
      const onChangeCallbackRequest: AWS.Lambda.InvocationRequest = {
        FunctionName: onChangeFunctionName,
        InvocationType: 'Event',
      };

      console.log(JSON.stringify({ onChangeCallbackRequest }));
      const onChangeCallbackResponse = await lambda.invoke(onChangeCallbackRequest).promise();
      console.log(JSON.stringify({ onChangeCallbackResponse }));
    }
  }
}
