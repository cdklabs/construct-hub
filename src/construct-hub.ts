import { Construct as CoreConstruct } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { AlarmActions, Domain } from './api';
import { Dummy } from './dummy';
import { Monitoring } from './monitoring';
import { WebApp } from './webapp';

/**
 * Props for `ConstructHub`.
 */
export interface ConstructHubProps {
  /**
   * Connect the hub to a domain (requires a hosted zone and a certificate).
   */
  readonly domain?: Domain;

  /**
   * The name of the CloudWatch Dashboard created to observe this application.
   *
   * Must only contain alphanumerics, dash (-) and underscore (_).
   *
   * @default "construct-hub"
   */
  readonly dashboardName?: string;

  /**
   * Actions to perform when alarms are set.
   */
  readonly alarmActions: AlarmActions;
}

/**
 * Construct Hub.
 */
export class ConstructHub extends CoreConstruct {
  public constructor(scope: Construct, id: string, props: ConstructHubProps) {
    super(scope, id);

    const monitoring = new Monitoring(this, 'Monitoring', {
      alarmActions: props.alarmActions,
      dashboardName: props.dashboardName ?? 'construct-hub',
    });

    // add some dummy resources so that we have _something_ to monitor.
    new Dummy(this, 'Dummy', {
      monitoring: monitoring,
    });

    new WebApp(this, 'WebApp', {
      domain: props.domain,
      monitoring: monitoring,
    });
  }
}
