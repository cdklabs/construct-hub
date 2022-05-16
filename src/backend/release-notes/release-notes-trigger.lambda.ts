import { SQSEvent } from 'aws-lambda';
import * as aws from 'aws-sdk';
import { SendMessageBatchRequestEntryList } from 'aws-sdk/clients/sqs';
import { requireEnv } from '../shared/env.lambda-shared';

const SLEEP_TIME = 1000 * 5; // 5 seconds

/**
 *
 * @param event SQSEvent
 * The lambda functions moves the messages from the release notes
 * fetch queue to worker queue. These queues are kept separate so the
 * release notes fetch task can respect the Github API service limits
 * The release notes queue is the queue is intake queue and this lambda
 * gets triggered when there is a new message. When triggered the messages
 * are moved from intake queue to worker queue which is handled by Step function
 *
 * As part of execution of this lambda ensures that an instance of the release
 * note step function is executing to process the messages in worker queue.
 * @returns void
 */
export const handler = async (event: SQSEvent) => {
  const SFN_ARN = requireEnv('SFN_ARN');
  const WORKER_QUEUE_URL = requireEnv('WORKER_QUEUE_URL');

  const sqs = new aws.SQS();
  let messages: SendMessageBatchRequestEntryList = [];
  console.log('attempting to send messages');
  const requests = event.Records.map<any>((record, index) => {
    if (index > 0 && index % 10 === 0) {
      return sqs
        .sendMessageBatch({
          Entries: messages,
          QueueUrl: WORKER_QUEUE_URL,
        })
        .promise();
      messages = [];
    } else {
      console.log('message => ', record.body);
      messages.push({ Id: record.messageId, MessageBody: record.body });
      return false;
    }
  }).filter(Boolean);

  // last batch of message
  if (messages.length) {
    requests.push(
      sqs
        .sendMessageBatch({
          Entries: messages,
          QueueUrl: WORKER_QUEUE_URL,
        })
        .promise()
    );
  }
  await Promise.all(requests);
  console.log('messages sent');

  if (await isStepFunctionAlreadyRunning()) {
    // there is a function already running
    // wait for a sent messages to settle and query the function again
    await new Promise<void>((resolve) => {
      console.log('sleeping');
      setTimeout(() => {
        console.log('Sleeping done for ', SLEEP_TIME);
        resolve();
      }, SLEEP_TIME);
    });
    if (await isStepFunctionAlreadyRunning()) return;
  }

  const sfn = new aws.StepFunctions();
  const invocation = await sfn
    .startExecution({
      stateMachineArn: SFN_ARN,
    })
    .promise();
  console.log('invocation done', invocation);
  return;
};

const isStepFunctionAlreadyRunning = async (): Promise<boolean> => {
  const SFN_ARN = requireEnv('SFN_ARN');
  const sfn = new aws.StepFunctions();

  const invocations = await sfn
    .listExecutions({
      stateMachineArn: SFN_ARN,
      statusFilter: 'RUNNING',
    })
    .promise();
  return invocations.executions.length > 0;
};
