import { Construct } from '@aws-cdk/core';
import { Watchful } from 'cdk-watchful';

/**
 * Props for the monitoring construct.
 */
export interface MonitoringProps {
  /**
   * The construct scope to monitor. All "watchable" resources within this scope
   * will be automatically monitored through standard monitoring.
   */
  readonly watchScope: Construct;
}

/**
 * Construct hub monitoring.
 */
export class Monitoring extends Construct {
  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);

    const watchful = new Watchful(this, 'Watchful', {
      dashboardName: 'construct-hub',
    });

    watchful.watchScope(props.watchScope);
  }
}