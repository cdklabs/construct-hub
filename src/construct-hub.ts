import * as certificatemanager from '@aws-cdk/aws-certificatemanager';
import * as route53 from '@aws-cdk/aws-route53';
import * as sns from '@aws-cdk/aws-sns';
import { Construct as CoreConstruct } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { Dummy } from './dummy';
import { Monitoring } from './monitoring';
import { WebApp } from './webapp';

export interface ConstructHubProps {
  /**
   * Connect the hub to a domain (requires a hosted zone and a certificate).
   */
  readonly domain?: WebAppDomain;

  /**
   * Contact URLs to be used for contacting this Construct Hub operators.
   *
   * @default - none
   */
  readonly contactUrls?: ContactURLs;

  /**
   * Whether the package feed from the npmjs.com registry should be enabled.
   *
   * @default true
   */
  readonly enableNpmFeed?: boolean;

  /**
   * An optional topic to be notified whenever a new package is indexed into
   * this Construct Hub instance.
   *
   * @default - none
   */
  readonly updatesTopic?: sns.ITopic;

  /**
   * The name of the CloudWatch Dashboard created to observe this application.
   *
   * @default - the path to this construct is used as the dashboard name.
   */
  readonly dashboardName?: string;

  /**
   * Actions to perform when alarms are set.
   */
  readonly alarmActions: MonitoringAlarmActions;
}

export interface WebAppDomain {
  /**
   * The root domain name where this instance of Construct Hub will be served.
   */
  readonly zone: route53.IHostedZone;

  /**
    * The certificate to use for serving the Construct Hub over a custom domain.
    *
    * @default - a DNS-Validated certificate will be provisioned using the
    *            provided `hostedZone`.
    */
  readonly cert: certificatemanager.ICertificate;
}

export interface ContactURLs {
  /**
   * The URL to the issue tracker or documentation for reporting security
   * issues.
   *
   * @default - none
   */
  readonly securityIssue?: string;

  /**
   * The URL to the issue tracker or documentation for requesting a package be
   * un-listed from this Construct Hub instance.
   *
   * @default - none
   */
  readonly unlistPackage?: string;

  /**
   * The URL to the issue tracker or documentation for reporting other issues.
   *
   * @default - none
   */
  readonly other?: string;
}

export class ConstructHub extends CoreConstruct {
  public constructor(scope: Construct, id: string, props: ConstructHubProps) {
    super(scope, id);

    const monitoring = new Monitoring(this, 'Monitoring', {
      alarmActions: props.alarmActions,
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

/**
 * CloudWatch alarm actions to perform.
 */
export interface MonitoringAlarmActions {
  /**
   * The ARN of the CloudWatch alarm action to take for alarms of high-severity
   * alarms.
   *
   * This must be an ARN that can be used with CloudWatch alarms.
   * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions
   */
  readonly highSeverity: string;

  /**
   * The ARN of the CloudWatch alarm action to take for alarms of normal
   * severity.
   *
   * This must be an ARN that can be used with CloudWatch alarms.
   * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions
   *
   * @default - no actions are taken in response to alarms of normal severity
   */
  readonly normalSeverity?: string;
}