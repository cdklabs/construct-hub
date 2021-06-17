import * as cw from '@aws-cdk/aws-cloudwatch';
import { Construct } from '@aws-cdk/core';
import { Watchful } from 'cdk-watchful';
import { AlarmActions } from '../api';
import { WebCanary } from './web-canary';

/**
 * Props for the monitoring construct.
 */
export interface MonitoringProps {
  /**
   * ARNs of alarm actions to take for various severities.
   */
  readonly alarmActions: AlarmActions;

  /**
   * The name of the CloudWatch dashboard for this app.
   *
   * Must only contain alphanumerics, dash (-) and underscore (_).
   */
  readonly dashboardName: string;
}

/**
 * Construct hub monitoring.
 *
 * This construct uses cdk-watchful to automatically generate a dashboard and a
 * set of standard alarms for common resources.
 *
 * Components should use the APIs of this module to add watchful monitors,
 * and add canaries and alarms as needed.
 */
export class Monitoring extends Construct {
  private alarmActions: AlarmActions;

  /**
   * Allows adding automatic monitoring to standard resources. Note that
   * watchful alarms are always treated as _normal_ severity. You can add
   * high-severity alarm via `addHighSeverityAlarm()`.
   */
  public readonly watchful: Watchful;

  private readonly highSeverityDashboard: cw.Dashboard;

  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);

    this.alarmActions = props.alarmActions;

    this.watchful = new Watchful(this, 'Watchful', {
      dashboardName: props.dashboardName,
      // alarms that come from watchful are all considered normal severity
      alarmActionArns: this.alarmActions.normalSeverity ? [this.alarmActions.normalSeverity] : [],
    });

    this.highSeverityDashboard = new cw.Dashboard(this, 'Dashboard', {
      dashboardName: `${props.dashboardName}-high-severity`,
    });
  }

  /**
   * Adds a high-severity alarm. If this alarm goes off, the action specified in `highSeverityAlarmActionArn`
   * @param alarm
   */
  public addHighSeverityAlarm(title: string, alarm: cw.Alarm) {
    alarm.addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmActions.highSeverity }),
    });

    this.highSeverityDashboard.addWidgets(new cw.AlarmWidget({
      alarm,
      title,
      width: 24,
    }));
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
    const canary = new WebCanary(this, `WebCanary${name.replace(/[^A-Z0-9]/ig, '')}`, {
      url,
      displayName: name,
    });

    this.addHighSeverityAlarm(`${name} Canary`, canary.alarm);
  }
}
