import { ICertificate } from '@aws-cdk/aws-certificatemanager';
import { IHostedZone } from '@aws-cdk/aws-route53';
import { ITopic } from '@aws-cdk/aws-sns';
import { Construct } from '@aws-cdk/core';

export interface ConstructHubProps {
  /**
   * The root domain name where this instance of Construct Hub will be served.
   */
  readonly hostedZone: IHostedZone;

  /**
   * The certificate to use for serving the Construct Hub over a custom domain.
   *
   * @default - a DNS-Validated certificate will be provisioned using the
   *            provided `hostedZone`.
   */
  readonly tlsCertificate?: ICertificate;

  /**
   * An optional path prefix to use for serving the Construct Hub.
   *
   * @default - none.
   */
  readonly pathPrefix?: string;

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
  readonly updatesTopic?: ITopic;

  /**
   * The name of the CloudWatch Dashboard created to observe this application.
   *
   * @default - the path to this construct is used as the dashboard name.
   */
  readonly dashboardName?: string;
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

export class ConstructHub extends Construct {
  public constructor(scope: Construct, id: string, _props: ConstructHubProps) {
    super(scope, id);
  }
}
