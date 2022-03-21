import { IWidget } from '@aws-cdk/aws-cloudwatch';
import { IGrantable } from '@aws-cdk/aws-iam';
import { IQueue } from '@aws-cdk/aws-sqs';
import { Construct } from '@aws-cdk/core';
import { IDenyList } from './backend/deny-list/api';
import { ILicenseList } from './backend/license-list/api';
import { IRepository } from './codeartifact/api';
import { IMonitoring } from './monitoring/api';
import { IOnCallDashboard } from './on-call-dashboard/api';

/**
 * A package source for ConstructHub.
 */
export interface IPackageSource {
  /**
   * Binds the package source to a scope and target queue.
   *
   * @param scope the construct scope in which the binding happens.
   * @param opts  options for binding the package source.
   *
   * @returns a dependable resource that can be used to create a CloudFormation
   *          dependency on the bound source.
   */
  bind(scope: Construct, opts: PackageSourceBindOptions): PackageSourceBindResult;
}

/**
 * Options for binding a package source.
 */
export interface PackageSourceBindOptions {
  /**
   * The base URL of the bound ConstructHub instance.
   */
  readonly baseUrl: string;

  /**
   * The configured `DenyList` for the bound Construct Hub instance, if any.
   */
  readonly denyList?: IDenyList;

  /**
   * The `IGrantable` that will process downstream messages from the bound
   * package source. It needs to be granted permissions to read package data
   * from the URLs sent to the `queue`.
   */
  readonly ingestion: IGrantable;

  /**
   * The license list applied by the bound Construct Hub instance. This can be
   * used to filter down the package only to those which will pass the license
   * filter.
   */
  readonly licenseList: ILicenseList;

  /**
   * The monitoring instance to use for registering alarms, etc.
   */
  readonly monitoring: IMonitoring;

  /**
   * The on-call dashboard to add widgets to.
   */
  readonly onCallDashboard: IOnCallDashboard;

  /**
   * The SQS queue to which messages should be sent. Sent objects should match
   * the package discovery schema.
   */
  readonly queue: IQueue;

  /**
   * The CodeArtifact repository that is internally used by ConstructHub. This
   * may be undefined if no CodeArtifact repository is internally used.
   */
  readonly repository?: IRepository;
}

/**
 * The result of binding a package source.
 */
export interface PackageSourceBindResult {
  /**
   * The name of the bound package source. It will be used to render operator
   * dashboards (so it should be a meaningful identification of the source).
   */
  readonly name: string;

  /**
   * An optional list of linked resources to be displayed on the monitoring
   * dashboard.
   */
  readonly links?: LinkedResource[];

  /**
   * Widgets to add to the operator dashbaord for monitoring the health of the
   * bound package source. It is not necessary for this list of widgets to
   * include a title section (this will be added automatically). One array
   * represents a row of widgets on the dashboard.
   */
  readonly dashboardWidgets: IWidget[][];
}

export interface LinkedResource {
  /**
   * The name of the linked resource.
   */
  readonly name: string;

  /**
   * The URL where the linked resource can be found.
   */
  readonly url: string;

  /**
   * Whether this is the primary resource of the bound package source. It is not
   * necessary that there is one, and there could be multiple primary resources.
   * The buttons for those will be rendered with a different style on the
   * dashboard.
   */
  readonly primary?: boolean;
}
