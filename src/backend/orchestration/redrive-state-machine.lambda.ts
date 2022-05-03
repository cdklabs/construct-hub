import { Context } from 'aws-lambda';
import type * as AWS from 'aws-sdk';
import * as aws from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';

export async function handler(event: unknown, context: Context): Promise<void> {
  const stateMachineArn = requireEnv('STATE_MACHINE_ARN');
  const queueUrl = requireEnv('QUEUE_URL');

  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  const sfn = aws.stepFunctions();

  for await (const message of messagesToRedrive(queueUrl)) {
    const input = JSON.parse(message.Body!);
    console.log(`Redriving message ${JSON.stringify(input, null, 2)}`);

    // Strip the docgen field before redriving as this contains error messages that
    // be too long for ECS inputs.
    const { docGen, ...formatted } = input;
    const { executionArn } = await sfn
      .startExecution({
        stateMachineArn: stateMachineArn,
        input: JSON.stringify({
          ...formatted,
          // Remove the _error information
          _error: undefined,
          // Add the redrive information
          _redrive: {
            lambdaRequestId: context.awsRequestId,
            lambdaLogGroupName: context.logGroupName,
            lambdaLogStreamName: context.logStreamName,
          },
        }),
      })
      .promise();
    console.log(`Redrive execution ARN: ${executionArn}`);

    await aws
      .sqs()
      .deleteMessage({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle!,
      })
      .promise();
  }
}

async function* messagesToRedrive(queueUrl: string) {
  const sqs = aws.sqs();
  let result: AWS.SQS.ReceiveMessageResult;
  do {
    result = await sqs
      .receiveMessage({
        QueueUrl: queueUrl,
        VisibilityTimeout: 900, // 15 minutes
      })
      .promise();
    if (result.Messages) {
      yield* result.Messages;
    }
  } while (result.Messages != null && result.Messages.length > 0);
}
