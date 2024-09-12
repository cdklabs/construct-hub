import { StartExecutionCommand } from '@aws-sdk/client-sfn';
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  ReceiveMessageCommandOutput,
} from '@aws-sdk/client-sqs';
import type { Context } from 'aws-lambda';
import { SFN_CLIENT, SQS_CLIENT } from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';

export async function handler(event: unknown, context: Context): Promise<void> {
  const stateMachineArn = requireEnv('STATE_MACHINE_ARN');
  const queueUrl = requireEnv('QUEUE_URL');

  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  for await (const message of messagesToRedrive(queueUrl)) {
    const input = JSON.parse(message.Body!);
    console.log(`Redriving message ${JSON.stringify(input, null, 2)}`);

    const { executionArn } = await SFN_CLIENT.send(
      new StartExecutionCommand({
        stateMachineArn: stateMachineArn,
        input: JSON.stringify({
          ...input,
          // Remove unnecessary fields that would bloat the input size
          $TaskExecution: undefined,
          catalogNeedsUpdating: undefined,
          docGen: undefined,
          _error: undefined,
          error: undefined,
          // Add the redrive information
          _redrive: {
            lambdaRequestId: context.awsRequestId,
            lambdaLogGroupName: context.logGroupName,
            lambdaLogStreamName: context.logStreamName,
          },
        }),
      })
    );
    console.log(`Redrive execution ARN: ${executionArn}`);

    await SQS_CLIENT.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle!,
      })
    );
  }
}

async function* messagesToRedrive(queueUrl: string) {
  let result: ReceiveMessageCommandOutput;
  do {
    result = await SQS_CLIENT.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        VisibilityTimeout: 900, // 15 minutes
      })
    );
    if (result.Messages) {
      yield* result.Messages;
    }
  } while (result.Messages != null && result.Messages.length > 0);
}
