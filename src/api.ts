// this file includes types that are part of the library's public API

import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import { IAlarmAction } from 'aws-cdk-lib/aws-cloudwatch';
import * as route53 from 'aws-cdk-lib/aws-route53';

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

export enum AlarmSeverity {
  HIGH,
  MEDIUM,
  LOW,
}

/**
 * Configure severities for various alarms.
 *
 * Alarms not included here are currently not configurable.
 */
export interface AlarmSeverities {

  /**
   * @default AlarmSeverity.HIGH
   */
  readonly backendOrchestrationFailed?: AlarmSeverity;

  /**
   * @default AlarmSeverity.LOW
   */
  readonly packageCanarySLABreached?: AlarmSeverity;

}

/**
 * Construct paths of alarms that can be overridden via `alarmOverrides`.
 *
 * The path is relative to the `ConstructHub` construct.
 */
export enum AlarmPath {
  SOURCES_NPMJS_FOLLOWER_FAILURES = 'Sources/NpmJs/Follower/Failures',
  SOURCES_NPMJS_FOLLOWER_NOT_RUNNING = 'Sources/NpmJs/Follower/NotRunning',
  SOURCES_NPMJS_FOLLOWER_NO_CHANGES = 'Sources/NpmJs/Follower/NoChanges',
  SOURCES_NPMJS_STAGER_DLQ_NOT_EMPTY = 'Sources/NpmJs/Stager/DLQNotEmpty',
  SOURCES_NPMJS_CANARY_SLA_BREACHED = 'Sources/NpmJs/Canary/SLA-Breached',
  SOURCES_NPMJS_CANARY_STALE_PACKAGE = 'Sources/NpmJs/Canary/StaleCanaryPackage',
  SOURCES_NPMJS_CANARY_FAILING = 'Sources/NpmJs/Canary/Failing',
  SOURCES_NPMJS_CANARY_NOT_RUNNING = 'Sources/NpmJs/Canary/NotRunning',
  SOURCES_NPMJS_CANARY_NOT_RUNNING_OR_FAILING = 'Sources/NpmJs/Canary/NotRunningOrFailing',
  SOURCES_NPMJS_CANARY_GATEWAY_ERRORS = 'Sources/NpmJs/Canary/GatewayErrors',
  INGESTION_DLQ_NOT_EMPTY = 'Ingestion/DLQNotEmpty',
  INGESTION_FAILURE = 'Ingestion/Failure',
  INGESTION_REPROCESS_WORKFLOW_FAILURE = 'Ingestion/ReprocessWorkflow/Failure',
  FEED_BUILDER_FAILURE = 'FeedBuilder/Failure',
  ORCHESTRATION_DLQ_NOT_EMPTY = 'Orchestration/DLQ/NotEmpty',
  ORCHESTRATION_EXECUTIONS_FAILED = 'Orchestration/Resource/ExecutionsFailed',
  ORCHESTRATION_EXECUTION_FAILURE_RATE = 'Orchestration/Resource/ExecutionFailureRate',
  ORCHESTRATION_SHRINKING_CATALOG = 'Orchestration/CatalogBuilder/ShrinkingCatalog',
  INVENTORY_CANARY_NOT_RUNNING = 'InventoryCanary/NotRunning',
  INVENTORY_CANARY_FAILURES = 'InventoryCanary/Failures',
  PACKAGE_STATS_FAILURES = 'PackageStats/Failures',
  VERSION_TRACKER_FAILURES = 'VersionTracker/Failures',
  VERSION_TRACKER_NOT_RUNNING = 'VersionTracker/NotRunning',
  RELEASE_NOTES_GENERATION_FAILURE = 'ReleaseNotes/ReleaseNotesGenerationFailure',
  RELEASE_NOTES_TRIGGER_FAILURE = 'ReleaseNotes/ReleaseNotesTriggerFailure',
  RELEASE_NOTES_INVALID_GITHUB_CREDENTIALS = 'ReleaseNotes/ReleaseNotesInvalidGitHubCredentials',
  RELEASE_NOTES_GITHUB_RATE_LIMIT = 'ReleaseNotes/ReleaseNotes Github rate limit',
  WEBAPP_ACM_CERTIFICATE_EXPIRES_SOON = 'WebApp/ExpirationMonitor/ACMAlarm',
  WEBAPP_ENDPOINT_CERTIFICATE_EXPIRES_SOON = 'WebApp/ExpirationMonitor/EndpointAlarm',
}

/**
 * An override for a specific alarm.
 */
export interface AlarmOverride {
  /**
   * Wire this alarm to a different severity bucket's action.
   *
   * @default - the severity hardcoded by the alarm's author
   */
  readonly severity?: AlarmSeverity;

  /**
   * Wire custom actions onto this alarm, replacing the severity bucket's action.
   *
   * @default - the severity bucket's action
   */
  readonly actions?: IAlarmAction[];
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
   * The ARN of the CloudWatch alarm action to take for alarms of medium-severity
   * alarms.
   *
   * This must be an ARN that can be used with CloudWatch alarms.
   * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions
   */
  readonly mediumSeverity?: string;

  /**
   * The CloudWatch alarm action to take for alarms of medium-severity alarms.
   *
   * This must be an ARN that can be used with CloudWatch alarms.
   * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions
   */
  readonly mediumSeverityAction?: IAlarmAction;

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
