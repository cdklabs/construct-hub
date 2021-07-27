import { IFunction } from '@aws-cdk/aws-lambda';
import { IQueue } from '@aws-cdk/aws-sqs';
import { IStateMachine } from '@aws-cdk/aws-stepfunctions';
import { Stack } from '@aws-cdk/core';

export function lambdaFunctionUrl(lambda: IFunction): string {
  return `/lambda/home#/functions/${lambda.functionName}`;
}

export function lambdaSearchLogGroupUrl(lambda: IFunction): string {
  return `/cloudwatch/home#logsV2:log-groups/log-group/$252Faws$252flambda$252f${lambda.functionName}/log-events`;
}

export function stateMachineUrl(stateMachine: IStateMachine): string {
  return `/states/home#/statemachines/view/${stateMachine.stateMachineArn}`;
}

export function sqsQueueUrl(queue: IQueue): string {
  const stack = Stack.of(queue);
  // We can't use the Queue URL as-is, because we can't "easily" URL-encode it in CFN...
  return `/sqs/v2/home#/queues/https%3A%2F%2Fsqs.${stack.region}.amazonaws.com%2F${stack.account}%2F${queue.queueName}`;
}
