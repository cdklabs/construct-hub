export const METRICS_NAMESPACE = 'ConstructHub/EcsTaskMonitor';

export const enum MetricName {
  TASK_AGE = 'TaskAge',
  TASK_COUNT = 'TaskCount',
  KILLED_TASK_COUNT = 'KilledTaskCount',
}

export const enum Environment {
  CLUSTER_NAME = 'CLUSTER_NAME',
  TIMEOUT_MILLIS = 'TIMEOUT_MILLIS',
}
