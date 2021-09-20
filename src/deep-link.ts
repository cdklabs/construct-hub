import { CfnRepository } from '@aws-cdk/aws-codeartifact';
import { ICluster } from '@aws-cdk/aws-ecs';
import { IFunction } from '@aws-cdk/aws-lambda';
import { ILogGroup } from '@aws-cdk/aws-logs';
import { IBucket } from '@aws-cdk/aws-s3';
import { IQueue } from '@aws-cdk/aws-sqs';
import { IStateMachine } from '@aws-cdk/aws-stepfunctions';
import { Fn, Stack } from '@aws-cdk/core';

export function codeArtifactRepositoryUrl(repository: CfnRepository) {
  return `/codesuite/codeartifact/d/${repository.attrDomainOwner}/${repository.attrDomainName}/r/${repository.attrName}`;
}

export function ecsClusterUrl(cluster: ICluster): string {
  return `/ecs/home#/clusters/${cluster.clusterName}/tasks`;
}

export function lambdaFunctionUrl(lambda: IFunction): string {
  return `/lambda/home#/functions/${lambda.functionName}`;
}

export function lambdaSearchLogGroupUrl(lambda: IFunction): string {
  return `/cloudwatch/home#logsV2:log-groups/log-group/$252Faws$252flambda$252f${lambda.functionName}/log-events`;
}

export function logGroupUrl(logGroup: ILogGroup): string {
  return `/cloudwatch/home#logsV2:log-groups/log-group/${Fn.join('%252', Fn.split('/', logGroup.logGroupName))}`;
}

export function s3ObjectUrl(bucket: IBucket, objectKey?: string): string {
  if (objectKey) {
    return `/s3/object/${bucket.bucketName}?prefix=${objectKey}`;
  } else {
    return `/s3/buckets/${bucket.bucketName}`;
  }
}

export function stateMachineUrl(stateMachine: IStateMachine): string {
  return `/states/home#/statemachines/view/${stateMachine.stateMachineArn}`;
}

export function sqsQueueUrl(queue: IQueue): string {
  const stack = Stack.of(queue);
  // We can't use the Queue URL as-is, because we can't "easily" URL-encode it in CFN...
  return `/sqs/v2/home#/queues/https%3A%2F%2Fsqs.${stack.region}.amazonaws.com%2F${stack.account}%2F${queue.queueName}`;
}
