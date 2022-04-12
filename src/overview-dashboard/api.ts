import { IFunction } from '@aws-cdk/aws-lambda';
import { IQueue } from '@aws-cdk/aws-sqs';

/**
 * ConstructHub OnCall dashboard exposed to extension points.
 */
export interface IOverviewDashboard {
  /**
   * Adds widgets to on-call dashboard with link to the dashboard and number of visible messages.
   * @param name of the DLQ that will be used in the dashboard
   * @param deadLetterQueue Dead Letter Queue to be used in the dashboard
   * @param reDriveFunction a lambda function that will be used to re-drive the DLQ
   */
  addDLQMetricToDashboard(name: string, deadLetterQueue: IQueue, reDriveFunction?: IFunction): void;

  /**
   * Adds a metric widget to the on-call dashboard showing the total number concurrent executions
   * of a Lambda function and the percentage of SERVICE_QUOTA utilized by the function. This can be
   * used to see which function has the most impact of the service quota.
   * @param fn Lambda function to be monitored
   */
  addConcurrentExecutionMetricToOnCallDashboard(fn: IFunction, name?: string): void;

}
