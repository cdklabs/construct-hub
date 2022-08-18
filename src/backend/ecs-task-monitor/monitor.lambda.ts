import { metricScope, Configuration, Unit } from 'aws-embedded-metrics';
import { Context, ScheduledEvent } from 'aws-lambda';
import * as aws from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';
import { Environment, METRICS_NAMESPACE, MetricName } from './constants';

Configuration.namespace = METRICS_NAMESPACE;

export const handler = metricScope(
  (metrics) => async (event: ScheduledEvent, context: Context) => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);

    // Clear out the default dimensions, we won't need them.
    metrics.setDimensions();

    const CLUSTER_NAME = requireEnv(Environment.CLUSTER_NAME);
    const TIMEOUT_MILLIS = parseInt(requireEnv(Environment.TIMEOUT_MILLIS), 10);

    const ecs = aws.ecs();

    const cutOffTime = Date.now() - TIMEOUT_MILLIS;
    let theNextToken: string | undefined;
    let killCount = 0;
    try {
      let taskCount = 0;
      do {
        const { nextToken, taskArns } = await ecs
          .listTasks({
            cluster: CLUSTER_NAME,
            desiredStatus: 'RUNNING',
            maxResults: 100,
            nextToken: theNextToken,
          })
          .promise();
        theNextToken = nextToken;

        if (taskArns == null) {
          continue;
        }
        taskCount += taskArns.length;

        const { failures, tasks } = await ecs
          .describeTasks({
            cluster: CLUSTER_NAME,
            tasks: taskArns,
          })
          .promise();

        if (failures != null && failures.length > 0) {
          throw new Error(
            `DescribeTasks failures:\n- ${failures
              .map((failure) => JSON.stringify(failure, null, 2))
              .join('\n- ')}`
          );
        }

        const toTerminate = new Set<string>();
        for (const task of tasks ?? []) {
          // Task changed status while we were processing...
          if (task.lastStatus !== 'RUNNING') {
            continue;
          }
          const startedAt = task.startedAt!.getTime();
          if (startedAt < cutOffTime) {
            console.log(
              `Task ${task.taskArn!} started at ${task.startedAt!.toISOString()} and will be terminated`
            );
            toTerminate.add(task.taskArn!);
          }
          metrics.putMetric(
            MetricName.ACTIVE_TASK_AGE,
            Date.now() - startedAt,
            Unit.Milliseconds
          );
        }

        await Promise.all(
          Array.from(toTerminate).map((task) =>
            ecs
              .stopTask({
                cluster: CLUSTER_NAME,
                task,
                reason: `Terminated by ${context.functionName} (${context.awsRequestId}): Task timed out`,
              })
              .promise()
              .then(
                () => console.log(`SUCCESS: Terminated ${task}`),
                (error) =>
                  console.error(
                    `WARNING: Failed to terminate ${task}: ${error}`
                  )
              )
              .finally(() => (killCount += 1))
          )
        );
      } while (theNextToken != null);

      metrics.putMetric(MetricName.ACTIVE_TASK_COUNT, taskCount, Unit.Count);
    } finally {
      // Ensure we report kill count even if we aborted early due to an exception.
      metrics.putMetric(MetricName.KILLED_TASK_COUNT, killCount, Unit.Count);
    }
  }
);
