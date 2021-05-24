import * as cw from '@aws-cdk/aws-cloudwatch';
import { Construct } from '@aws-cdk/core';
import { Watchful } from 'cdk-watchful';
import { MonitoringAlarmActions } from '../construct-hub';
import { WebCanary } from './web-canary';

/**
 * Props for the monitoring construct.
 */
export interface MonitoringProps {
  /**
   * ARNs of alarm actions to take for various severities.
   */
  readonly alarmActions: MonitoringAlarmActions;
}

/**
 * Construct hub monitoring.
 *
 * This construct uses cdk-watchful to automatically generate a dashboard and a
 * set of standard alarms for all CDK resources in the construct hub.
 * Additionally, components may use the APIs of this module to add additional
 * canaries or alarms as needed.
 */
export class Monitoring extends Construct {
  private alarmActions: MonitoringAlarmActions;

  /**
   * Allows adding automatic monitoring to standard resources. Note that
   * watchful alarms are always treated as _normal_ severity. You can add
   * high-severity alarm via `addHighSeverityAlarm()`.
   */
  public readonly watchful: Watchful;

  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);

    this.alarmActions = props.alarmActions;

    this.watchful = new Watchful(this, 'Watchful', {
      dashboardName: 'construct-hub',
      alarmActionArns: this.alarmActions.normalSeverity ? [this.alarmActions.normalSeverity] : [], // alarms that come from watchful are all considered normal severity
    });
  }

  /**
   * Adds a high-severity alarm. If this alarm goes off, the action specified in `highSeverityAlarmActionArn`
   * @param alarm
   */
  public addHighSeverityAlarm(alarm: cw.Alarm) {
    alarm.addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmActions.highSeverity }),
    });
  }

  /**
   * Adds a canary that pings a certain URL and raises an alarm in case the URL
   * responds with an error over 80% of the times.
   *
   * Canary failures are always considered high-severity (at this point).
   *
   * @param name The name of the canary
   * @param url The URL to ping
   */
  public addWebCanary(name: string, url: string) {
    const canary = new WebCanary(this, `WebCanary${name}`, {
      url,
      displayName: name,
    });

    this.addHighSeverityAlarm(canary.alarm);
  }
}
