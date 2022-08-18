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
import { Monitor as Handler } from './monitor';

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
  private readonly period = Duration.minutes(15);

  public constructor(scope: Construct, id: string, props: EcsTaskMonitorProps) {
    super(scope, id);

    if (props.timeout.toMinutes({ integral: false }) < this.period.toMinutes({ integral: false})) {
      throw new Error(
        `The ECS task monitor timeout must be at least ${this.period} (received ${props.timeout}).`
      );
    }

    const resource = new Handler(this, 'Resource', {
      description: `[${this.node.path}] Monitors tasks on the ECS cluster ${props.cluster.clusterName}`,
      environment: {
        [Environment.CLUSTER_NAME]: props.cluster.clusterName,
        [Environment.TIMEOUT_MILLIS]: props.timeout.toMilliseconds().toFixed(),
      },
      reservedConcurrentExecutions: 1,
      timeout: Duration.minutes(15),
    });

    /**
     * These permissions might look surprising... Here's the TL;DR:
     *
     * - ListTasks operates on a container-instance
     * - DescribeTasks and StopTask operates on tasks
     *
     * The ARN formats follow:
     * - Container Instance ARN: arn:${Partition}:ecs:${Region}:${Account}:container-instance/${ClusterName}/${ContainerInstanceId}
     * - Task ARN:               arn:${Partition}:ecs:${Region}:${Account}:task/${ClusterName}/${TaskId}
     *
     * @see https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonelasticcontainerservice.html
     */
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
      schedule: aws_events.Schedule.rate(this.period),
      targets: [new aws_events_targets.LambdaFunction(resource)],
    });
  }

  /**
   * The age of all active tasks on the monitored ECS cluster.
   */
  public metricActiveTaskAge(
    opts?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return new aws_cloudwatch.Metric({
      period: this.period,
      statistic: aws_cloudwatch.Statistic.MAXIMUM,
      ...opts,
      namespace: METRICS_NAMESPACE,
      metricName: MetricName.ACTIVE_TASK_AGE,
    });
  }

  /**
   * The count of active tasks on the monitored ECS cluster.
   */
  public metricActiveTaskCount(
    opts?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return new aws_cloudwatch.Metric({
      period: this.period,
      statistic: aws_cloudwatch.Statistic.AVERAGE,
      ...opts,
      namespace: METRICS_NAMESPACE,
      metricName: MetricName.ACTIVE_TASK_COUNT,
    });
  }

  /**
   * The count of timed-out tasks the montior attempted to terminate.
   */
  public metricKilledTaskCount(
    opts?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return new aws_cloudwatch.Metric({
      period: this.period,
      statistic: aws_cloudwatch.Statistic.MAXIMUM,
      ...opts,
      namespace: METRICS_NAMESPACE,
      metricName: MetricName.KILLED_TASK_COUNT,
    });
  }
}
