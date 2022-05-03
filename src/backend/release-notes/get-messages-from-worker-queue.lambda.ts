import { metricScope, Unit } from 'aws-embedded-metrics';
import { StepFunctions, SQS } from 'aws-sdk';
import { requireEnv } from '../shared/env.lambda-shared';
import * as constants from './constants';

// Each of the release note fetch task can involve making multiple Github
// API requests. This is a worst case scenario where a package might require
// MAX_GH_REQUEST_PER_PACKAGE number of requests. This will be used to
// ensure that the state machine does not hammer and exhaust the service limits
const MAX_GH_REQUEST_PER_PACKAGE = 10;

import { getServiceLimits } from './shared/github-changelog-fetcher.lambda-shared';

type ServiceLimit = {
  waitUntil: string;
  remaining: number;
  limit: number;
  used: number;
};
type ExecutionResult = {
  error?: string;
  status?: string;
  messages?: SQS.Message[];
};

/**
 * Lambda function executed by the release notes fetch step function to get the
 * list of packages for which the release notes have to be fetched. This
 * function considers the Github API service limitation and before returning
 * the list of packages
 * Pre conditions:
 * 1. Has valid Github credentials for making API requests
 * 2. Service quota limits have not be hit. If the limit has been hit, then
 * the function will return time when the quota will be reset so step function
 * can wait until then
 *
 * If these conditions are met, the function will return up to 10 packages
 * per execution
 *
 * @returns ExecutionResult | ServiceLimit
 */
export const handler = async (): Promise<ExecutionResult | ServiceLimit> => {
  let serviceLimit;
  try {
    serviceLimit = await getServiceLimits();
  } catch (e) {
    if ((e as any).status == 401) {
      await metricScope((metrics) => async () => {
        metrics.setDimensions();

        metrics.setNamespace(constants.METRICS_NAMESPACE);
        metrics.putMetric(constants.InvalidCredentials, 1, Unit.Count);
      })();

      return { error: 'InvalidCredentials' };
    }
    await metricScope((metrics) => async () => {
      metrics.setDimensions();

      metrics.setNamespace(constants.METRICS_NAMESPACE);
      metrics.putMetric(constants.UnknownError, 1, Unit.Count);
    })();
    return { error: 'UnknownError' };
  }

  const sfnArn = requireEnv('STEP_FUNCTION_ARN');

  // Ensure only one instance of step function is running
  const activities = await new StepFunctions()
    .listExecutions({
      stateMachineArn: sfnArn,
      maxResults: 1,
      statusFilter: 'RUNNING',
    })
    .promise();

  if (activities.executions.length > 1) {
    return { error: 'MaxConcurrentExecutionError' };
  }
  if (serviceLimit.remaining <= MAX_GH_REQUEST_PER_PACKAGE) {
    return {
      waitUntil: new Date(serviceLimit.reset * 1000).toISOString(),
      remaining: serviceLimit.remaining,
      limit: serviceLimit.limit,
      used: serviceLimit.used,
    };
  }

  const messages = await new SQS()
    .receiveMessage({
      QueueUrl: process.env.SQS_QUEUE_URL!,
      MaxNumberOfMessages: Math.min(
        Math.floor(serviceLimit.remaining / MAX_GH_REQUEST_PER_PACKAGE),
        10
      ),
    })
    .promise();

  if (messages.Messages?.length) {
    return {
      messages: messages.Messages.map((m) => ({
        ...m,
        Body: JSON.parse(m.Body || '{}'),
      })),
    };
  } else {
    console.log('no messages');
  }
  return { status: 'NoMoreMessagesLeft' };
};
