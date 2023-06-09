export const METRICS_NAMESPACE = 'ConstructHub/EcsTaskMonitor';

export const enum MetricName {
  ACTIVE_TASK_AGE = 'ActiveTaskAge',
  ACTIVE_TASK_COUNT = 'ActiveTaskCount',
  KILLED_TASK_COUNT = 'KilledTaskCount',
}

export const enum Environment {
  CLUSTER_NAME = 'CLUSTER_NAME',
  TIMEOUT_MILLIS = 'TIMEOUT_MILLIS',
}
