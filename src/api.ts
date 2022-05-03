// this file includes types that are part of the library's public API

import * as certificatemanager from '@aws-cdk/aws-certificatemanager';
import { IAlarmAction } from '@aws-cdk/aws-cloudwatch';
import * as route53 from '@aws-cdk/aws-route53';

export * from './backend/deny-list/api';
export * from './backend/license-list/api';
export * from './codeartifact/api';
export * from './monitoring/api';
export * from './overview-dashboard/api';

/**
 * Domain configuration for the website.
 */
export interface Domain {
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

  /**
   * Whether the certificate should be monitored for expiration, meaning high
   * severity alarms will be raised if it is due to expire in less than 45 days.
   *
   * @default true
   */
  readonly monitorCertificateExpiration?: boolean;
}

/**
 * CloudWatch alarm actions to perform.
 */
export interface AlarmActions {
  /**
   * The ARN of the CloudWatch alarm action to take for alarms of high-severity
   * alarms.
   *
   * This must be an ARN that can be used with CloudWatch alarms.
   * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions
   */
  readonly highSeverity?: string;

  /**
   * The CloudWatch alarm action to take for alarms of high-severity alarms.
   *
   * This must be an ARN that can be used with CloudWatch alarms.
   * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions
   */
  readonly highSeverityAction?: IAlarmAction;

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

  /**
   * The CloudWatch alarm action to take for alarms of normal severity.
   *
   * This must be an ARN that can be used with CloudWatch alarms.
   * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions
   *
   * @default - no actions are taken in response to alarms of normal severity
   */
  readonly normalSeverityAction?: IAlarmAction;
}
