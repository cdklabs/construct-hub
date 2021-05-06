import * as sns from '@aws-cdk/aws-sns';
import { Construct as CoreConstruct } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { Dummy } from './dummy';
import { Monitoring } from './monitoring';
import { WebAppDomain, WebApp } from './webapp';

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
  public constructor(scope: Construct, id: string, props: ConstructHubProps = {}) {
    super(scope, id);

    // add some dummy resources so that we have _something_ to monitor.
    new Dummy(this, 'Dummy');

    new WebApp(this, 'WebApp', {
      domain: props.domain,
    });

    new Monitoring(this, 'Monitoring', {
      watchScope: this,
    });
  }
}
