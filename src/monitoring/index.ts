import * as cw from '@aws-cdk/aws-cloudwatch';
import { Construct } from '@aws-cdk/core';
import { Watchful } from 'cdk-watchful';
import { AlarmActions } from '../api';
import { IMonitoring } from './api';
import { WebCanary } from './web-canary';

/**
 * Props for the monitoring construct.
 */
export interface MonitoringProps {
  /**
   * ARNs of alarm actions to take for various severities.
   */
  readonly alarmActions?: AlarmActions;
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
export class Monitoring extends Construct implements IMonitoring {
  private alarmActions?: AlarmActions;
  private _highSeverityAlarms: cw.Alarm[];
  private _lowSeverityAlarms: cw.Alarm[];

  /**
   * Allows adding automatic monitoring to standard resources. Note that
   * watchful alarms are always treated as _normal_ severity. You can add
   * high-severity alarm via `addHighSeverityAlarm()`.
   */
  public readonly watchful: Watchful;

  private readonly highSeverityDashboard: cw.Dashboard;

  constructor(scope: Construct, id: string, props: MonitoringProps = {}) {
    super(scope, id);

    this.alarmActions = props.alarmActions;

    this.watchful = new Watchful(this, 'Watchful', {
      // alarms that come from watchful are all considered normal severity
      alarmActionArns: this.alarmActions?.normalSeverity ? [this.alarmActions.normalSeverity] : [],
      alarmActions: this.alarmActions?.normalSeverityAction ? [this.alarmActions.normalSeverityAction] : [],
    });

    this._highSeverityAlarms = [];
    this._lowSeverityAlarms = [];

    this.highSeverityDashboard = new cw.Dashboard(this, 'HighSeverityDashboard');
  }

  /**
   * Adds a high-severity alarm. If this alarm goes off, the action specified in `highSeverityAlarmActionArn`
   * @param alarm
   */
  public addHighSeverityAlarm(title: string, alarm: cw.Alarm) {
    const highSeverityActionArn = this.alarmActions?.highSeverity;
    if (highSeverityActionArn) {
      alarm.addAlarmAction({
        bind: () => ({ alarmActionArn: highSeverityActionArn }),
      });
    }
    const highSeverityAction = this.alarmActions?.highSeverityAction;
    if (highSeverityAction) {
      alarm.addAlarmAction(highSeverityAction);
    }

    this.highSeverityDashboard.addWidgets(new cw.AlarmWidget({
      alarm,
      title,
      width: 24,
    }));

    this._highSeverityAlarms?.push(alarm);
  }

  public addLowSeverityAlarm(_title: string, alarm: cw.Alarm) {
    const normalSeverityActionArn = this.alarmActions?.normalSeverity;
    if (normalSeverityActionArn) {
      alarm.addAlarmAction({ bind: () => ({ alarmActionArn: normalSeverityActionArn }) });
    }
    const normalSeverityAction = this.alarmActions?.normalSeverityAction;
    if (normalSeverityAction) {
      alarm.addAlarmAction(normalSeverityAction);
    }
    this._lowSeverityAlarms?.push(alarm);
  }

  public get highSeverityAlarms() {
    return [...this._highSeverityAlarms];
  }

  public get lowSeverityAlarms() {
    return [...this._lowSeverityAlarms];
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
