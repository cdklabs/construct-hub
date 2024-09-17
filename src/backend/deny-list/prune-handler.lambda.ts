import { InvokeCommand, InvokeCommandInput } from '@aws-sdk/client-lambda';
import {
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
} from '@aws-sdk/client-s3';
import {
  SendMessageCommand,
  SendMessageCommandInput,
} from '@aws-sdk/client-sqs';
import { Configuration, metricScope, Unit } from 'aws-embedded-metrics';
import { DenyListClient } from './client.lambda-shared';
import {
  ENV_PRUNE_ON_CHANGE_FUNCTION_NAME,
  ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME,
  ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX,
  ENV_PRUNE_QUEUE_URL,
  MetricName,
  METRICS_NAMESPACE,
} from './constants';
import {
  LAMBDA_CLIENT,
  S3_CLIENT,
  SQS_CLIENT,
} from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';

// Configure embedded metrics format
Configuration.namespace = METRICS_NAMESPACE;

export async function handler(event: unknown) {
  console.log(`Event: ${JSON.stringify(event)}`);

  const client = await DenyListClient.newClient();

  await metricScope((metrics) => async () => {
    metrics.setDimensions({});

    const ruleCount = Object.keys(client.map).length;
    metrics.putMetric(MetricName.DENY_LIST_RULE_COUNT, ruleCount, Unit.Count);
  })();

  const packageData = requireEnv(ENV_PRUNE_PACKAGE_DATA_BUCKET_NAME);
  const pruneQueue = requireEnv(ENV_PRUNE_QUEUE_URL);
  const keyPrefix = requireEnv(ENV_PRUNE_PACKAGE_DATA_KEY_PREFIX);
  const objectsFound = new Array<string>();

  for (const nameVersion of Object.keys(client.map)) {
    const prefix = `${keyPrefix}${nameVersion}/`;
    console.log(
      `Querying bucket ${packageData} for all objects with prefix ${prefix}`
    );

    // for each prefix, query the package data bucket for all objects with that
    // prefix and delete them
    let continuation = undefined;
    do {
      const req: ListObjectsV2CommandInput = {
        Bucket: packageData,
        Prefix: prefix,
        ContinuationToken: continuation,
      };

      const result = await S3_CLIENT.send(new ListObjectsV2Command(req));
      continuation = result.NextContinuationToken;

      // queue all objects for deletion
      for (const object of result.Contents ?? []) {
        if (!object.Key) {
          continue;
        }
        const sendMessageRequest: SendMessageCommandInput = {
          QueueUrl: pruneQueue,
          MessageBody: object.Key,
        };

        console.log(JSON.stringify({ sendMessageRequest }));
        const sendMessageResponse = await SQS_CLIENT.send(
          new SendMessageCommand(sendMessageRequest)
        );
        console.log(JSON.stringify({ sendMessageResponse }));
        objectsFound.push(object.Key);
      }
    } while (continuation);
  }

  // trigger the "on change" if handler objects were found and we have a handler
  const onChangeFunctionName = process.env[ENV_PRUNE_ON_CHANGE_FUNCTION_NAME];
  if (onChangeFunctionName && objectsFound.length > 0) {
    console.log(`Triggering a on-change handler: ${onChangeFunctionName}`);
    const onChangeCallbackRequest: InvokeCommandInput = {
      FunctionName: onChangeFunctionName,
      InvocationType: 'Event',
    };

    console.log(JSON.stringify({ onChangeCallbackRequest }));
    const onChangeCallbackResponse = await LAMBDA_CLIENT.send(
      new InvokeCommand(onChangeCallbackRequest)
    );
    console.log(JSON.stringify({ onChangeCallbackResponse }));
  }
}
