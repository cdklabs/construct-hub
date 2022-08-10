import {
  ArnFormat,
  aws_cloudwatch,
  aws_ecs,
  aws_events,
  aws_iam,
  Duration,
  Stack,
  aws_events_targets,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Environment, METRICS_NAMESPACE, MetricName } from './constants';
import { Monitor } from './monitor';

export interface EcsTaskMonitorProps {
  /**
   * The ECS cluster on which tasks are to be monitored.
   */
  readonly cluster: aws_ecs.ICluster;

  /**
   * How long to allow tasks to run before they are deemed timed out and the
   * monitor will attempt to stop them. Must be 15 minutes or more.
   */
  readonly timeout: Duration;
}

/**
 * Monitors taks on a given ECS cluster and terminates those that have been
 * running for longer than a specified timeout.
 */
export class EcsTaskMonitor extends Construct {
  public constructor(scope: Construct, id: string, props: EcsTaskMonitorProps) {
    super(scope, id);

    if (props.timeout.toMinutes({ integral: false }) < 15) {
      throw new Error(
        'The ECS task monitor timeout must be at least 15 minutes.'
      );
    }

    const resource = new Monitor(this, 'Resource', {
      environment: {
        [Environment.CLUSTER_NAME]: props.cluster.clusterName,
        [Environment.TIMEOUT_MILLIS]: props.timeout.toMilliseconds().toFixed(),
      },
    });

    resource.addToRolePolicy(
      new aws_iam.PolicyStatement({
        actions: ['ecs:ListTasks', 'ecs:DescribeTasks', 'ecs:StopTask'],
        conditions: {
          ArnEquals: {
            'ecs:cluster': props.cluster.clusterArn,
          },
        },
        effect: aws_iam.Effect.ALLOW,
        resources: [
          Stack.of(this).formatArn({
            service: 'ecs',
            resource: 'container-instance',
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
            resourceName: `${props.cluster.clusterName}/*`,
          }),
          Stack.of(this).formatArn({
            service: 'ecs',
            resource: 'task',
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
            resourceName: `${props.cluster.clusterName}/*`,
          }),
        ],
      })
    );

    new aws_events.Rule(this, 'Schedule', {
      description: `Periodically runs the ECS Task Monitor (${this.node.path})`,
      enabled: true,
      schedule: aws_events.Schedule.rate(Duration.minutes(15)),
      targets: [new aws_events_targets.LambdaFunction(resource)],
    });
  }

  /**
   * The age of all active tasks on the monitored ECS cluster.
   */
  public metricTaskAge(
    opts?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return new aws_cloudwatch.Metric({
      statistic: aws_cloudwatch.Statistic.MAXIMUM,
      ...opts,
      namespace: METRICS_NAMESPACE,
      metricName: MetricName.TASK_AGE,
    });
  }

  /**
   * The count of active tasks on the monitored ECS cluster.
   */
  public metricTaskCount(
    opts?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return new aws_cloudwatch.Metric({
      statistic: aws_cloudwatch.Statistic.AVERAGE,
      ...opts,
      namespace: METRICS_NAMESPACE,
      metricName: MetricName.TASK_COUNT,
    });
  }

  /**
   * The count of timed-out tasks the montior attempted to terminate.
   */
  public metricKilledTaskCount(
    opts?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return new aws_cloudwatch.Metric({
      statistic: aws_cloudwatch.Statistic.MAXIMUM,
      ...opts,
      namespace: METRICS_NAMESPACE,
      metricName: MetricName.KILLED_TASK_COUNT,
    });
  }
}
