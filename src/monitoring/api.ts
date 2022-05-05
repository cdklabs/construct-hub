import type { Alarm } from 'aws-cdk-lib/aws-cloudwatch';

/**
 * ConstructHub monitoring features exposed to extension points.
 */
export interface IMonitoring {
  /**
   * Adds a high-severity alarm. If this alarm goes off, the action specified in
   * `highSeverityAlarmActionArn` is triggered.
   *
   * @param title a user-friendly title for the alarm (will be rendered on the
   *              high-severity CloudWatch dashboard)
   * @param alarm the alarm to be added to the high-severity dashboard.
   */
  addHighSeverityAlarm(title: string, alarm: Alarm): void;

  /**
   * Adds a low-severity alarm. If this alarm goes off, the action specified in
   * `normalAlarmAction` is triggered.
   *
   * @param title a user-friendly title for the alarm (not currently used).
   * @param alarm the alarm to be added.
   */
  addLowSeverityAlarm(title: string, alarm: Alarm): void;
}
