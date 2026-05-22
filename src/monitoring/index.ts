import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { Watchful } from 'cdk-watchful';
import { Construct } from 'constructs';
import { IMonitoring } from './api';
import { WebCanary } from './web-canary';
import { AlarmActions, AlarmOverride, AlarmSeverity } from '../api';

/**
 * Props for the monitoring construct.
 */
export interface MonitoringProps {
  /**
   * ARNs of alarm actions to take for various severities.
   */
  readonly alarmActions?: AlarmActions;

  /**
   * Per-alarm overrides keyed by the alarm's CloudWatch display name relative
   * to the `ConstructHub` construct.
   */
  readonly alarmOverrides?: { [alarmName: string]: AlarmOverride };
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
  private alarmOverrides: { [alarmName: string]: AlarmOverride };
  private matchedOverrideKeys = new Set<string>();
  private _highSeverityAlarms: cw.AlarmBase[];
  private _mediumSeverityAlarms: cw.AlarmBase[];
  private _lowSeverityAlarms: cw.AlarmBase[];

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
    this.alarmOverrides = props.alarmOverrides ?? {};

    this.watchful = new Watchful(this, 'Watchful', {
      // alarms that come from watchful are all considered normal severity
      alarmActionArns: this.alarmActions?.normalSeverity
        ? [this.alarmActions.normalSeverity]
        : [],
      alarmActions: this.alarmActions?.normalSeverityAction
        ? [this.alarmActions.normalSeverityAction]
        : [],
    });

    this._highSeverityAlarms = [];
    this._lowSeverityAlarms = [];
    this._mediumSeverityAlarms = [];

    this.highSeverityDashboard = new cw.Dashboard(
      this,
      'HighSeverityDashboard'
    );

    // Synth-time checks. Only run when `alarmOverrides` is in use — otherwise
    // we'd reject anonymous alarms that subclasses or downstream forks may
    // legitimately register without intending to make them overridable.
    this.node.addValidation({
      validate: () => {
        if (Object.keys(this.alarmOverrides).length === 0) return [];
        const errors: string[] = [];
        for (const alarm of this.allRegisteredAlarms()) {
          if (!this.relativeAlarmName(alarm)) {
            errors.push(
              `alarm '${alarm.node.path}' has no explicit alarmName, ` +
                'so it cannot be overridden via `alarmOverrides`. Set ' +
                '`alarmName: ${scope.node.path}/<short-name>` at the registration site.'
            );
          }
        }
        for (const k of Object.keys(this.alarmOverrides)) {
          if (!this.matchedOverrideKeys.has(k)) {
            errors.push(
              `alarmOverrides: '${k}' did not match any alarm. See ConstructHubProps.alarmOverrides for the list of overridable alarm names.`
            );
          }
        }
        return errors;
      },
    });
  }

  /**
   * Adds a high-severity alarm. If this alarm goes off, the action specified in `highSeverityAlarmActionArn`
   * @param alarm
   */
  public addHighSeverityAlarm(title: string, alarm: cw.AlarmBase) {
    if (this.applyOverride(title, alarm, AlarmSeverity.HIGH)) return;

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

    this.highSeverityDashboard.addWidgets(
      new cw.AlarmWidget({
        alarm,
        title,
        width: 24,
      })
    );

    this._highSeverityAlarms.push(alarm);
  }

  public addLowSeverityAlarm(title: string, alarm: cw.AlarmBase) {
    if (this.applyOverride(title, alarm, AlarmSeverity.LOW)) return;

    const normalSeverityActionArn = this.alarmActions?.normalSeverity;
    if (normalSeverityActionArn) {
      alarm.addAlarmAction({
        bind: () => ({ alarmActionArn: normalSeverityActionArn }),
      });
    }
    const normalSeverityAction = this.alarmActions?.normalSeverityAction;
    if (normalSeverityAction) {
      alarm.addAlarmAction(normalSeverityAction);
    }
    this._lowSeverityAlarms.push(alarm);
  }

  public addMediumSeverityAlarm(title: string, alarm: cw.AlarmBase) {
    if (this.applyOverride(title, alarm, AlarmSeverity.MEDIUM)) return;

    const actionArn = this.alarmActions?.mediumSeverity;
    if (actionArn) {
      alarm.addAlarmAction({
        bind: () => ({ alarmActionArn: actionArn }),
      });
    }
    const action = this.alarmActions?.mediumSeverityAction;
    if (action) {
      alarm.addAlarmAction(action);
    }
    this._mediumSeverityAlarms.push(alarm);
  }

  /**
   * If `alarm` has an entry in `alarmOverrides`, fully wire it (actions,
   * dashboard placement, bookkeeping) according to the override and return
   * true. Otherwise return false to let the caller fall back to default
   * bucket-based behavior.
   *
   * Lookup is by the alarm's CloudWatch display name (the `alarmName`
   * property), with the `${stack}/${ConstructHub-id}/` prefix stripped — so
   * customers write the same string they see in tickets.
   */
  private applyOverride(
    title: string,
    alarm: cw.AlarmBase,
    defaultSeverity: AlarmSeverity
  ): boolean {
    const relative = this.relativeAlarmName(alarm);
    if (!relative) return false;
    const override = this.alarmOverrides[relative];
    if (!override) return false;

    this.matchedOverrideKeys.add(relative);

    const severity = override.severity ?? defaultSeverity;

    if (override.actions && override.actions.length > 0) {
      for (const action of override.actions) {
        alarm.addAlarmAction(action);
      }
    } else {
      const arn =
        severity === AlarmSeverity.HIGH ? this.alarmActions?.highSeverity :
          severity === AlarmSeverity.MEDIUM ? this.alarmActions?.mediumSeverity :
            this.alarmActions?.normalSeverity;
      if (arn) alarm.addAlarmAction({ bind: () => ({ alarmActionArn: arn }) });

      const action =
        severity === AlarmSeverity.HIGH ? this.alarmActions?.highSeverityAction :
          severity === AlarmSeverity.MEDIUM ? this.alarmActions?.mediumSeverityAction :
            this.alarmActions?.normalSeverityAction;
      if (action) alarm.addAlarmAction(action);
    }

    if (severity === AlarmSeverity.HIGH) {
      this.highSeverityDashboard.addWidgets(
        new cw.AlarmWidget({ alarm, title, width: 24 })
      );
      this._highSeverityAlarms.push(alarm);
    } else if (severity === AlarmSeverity.MEDIUM) {
      this._mediumSeverityAlarms.push(alarm);
    } else {
      this._lowSeverityAlarms.push(alarm);
    }

    return true;
  }

  /**
   * Returns the alarm's CloudWatch display name with the `${ConstructHub.path}/`
   * prefix stripped, or undefined if the alarm has no explicit name.
   */
  private relativeAlarmName(alarm: cw.AlarmBase): string | undefined {
    // Both CfnAlarm and CfnCompositeAlarm expose `alarmName` directly.
    // Note: this only resolves when the alarm name is set to a literal string at
    // synth time. A CDK token (e.g. `Fn.join(...)`) won't match the prefix below.
    const cfn = alarm.node.defaultChild as
      | cw.CfnAlarm
      | cw.CfnCompositeAlarm
      | undefined;
    const fullName = cfn?.alarmName;
    if (!fullName) return undefined;
    const parent = this.node.scope;
    if (!parent) return undefined;
    const prefix = `${parent.node.path}/`;
    return fullName.startsWith(prefix) ? fullName.slice(prefix.length) : undefined;
  }

  public get highSeverityAlarms() {
    return [...this._highSeverityAlarms];
  }

  public get mediumSeverityAlarms() {
    return [...this._mediumSeverityAlarms];
  }

  public get lowSeverityAlarms() {
    return [...this._lowSeverityAlarms];
  }

  private allRegisteredAlarms(): cw.AlarmBase[] {
    return [
      ...this._highSeverityAlarms,
      ...this._mediumSeverityAlarms,
      ...this._lowSeverityAlarms,
    ];
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
    const canary = new WebCanary(
      this,
      `WebCanary${name.replace(/[^A-Z0-9]/gi, '')}`,
      {
        url,
        displayName: name,
      }
    );

    this.addHighSeverityAlarm(`${name} Canary`, canary.alarm);
  }
}

export function addAlarm(title: string, alarm: cw.Alarm, severity: AlarmSeverity, monitoring: IMonitoring) {
  switch (severity) {
    case AlarmSeverity.HIGH:
      monitoring.addHighSeverityAlarm(title, alarm);
      break;
    case AlarmSeverity.LOW:
      monitoring.addLowSeverityAlarm(title, alarm);
      break;
    case AlarmSeverity.MEDIUM:
      monitoring.addMediumSeverityAlarm(title, alarm);
      break;
    default:
      throw new Error(`Unknown alarm severity: ${severity}`);
  }
}
