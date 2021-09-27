import { ICertificate } from '@aws-cdk/aws-certificatemanager';
import { Alarm, ComparisonOperator, Metric, MetricOptions, Statistic, TreatMissingData } from '@aws-cdk/aws-cloudwatch';
import { Rule, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { Construct, Duration, Stack } from '@aws-cdk/core';
import { CertificateMonitor } from './certificate-monitor';

export interface MonitoredCertificateProps {
  /**
   * The ACM certificate to be monitored.
   */
  readonly certificate: ICertificate;

  /**
   * The DNS name of an endpoint using the monitored certificate.
   */
  readonly domainName: string;

  /**
   * The namespace of the CloudWatch metric emitted for the amount of days
   * remaining before expiry of the certificate used to serve HTTPS traffic on
   * the configured `domainName`.
   *
   * @default Stack.of(this).stackName
   */
  readonly metricNamespace?: string;

  /**
    * The name of the CloudWatch metric emitted for the amount of days remaining
    * before expiry of the certificate used to serve HTTPS traffic on the
    * configured `domainName`.
    *
    * @default 'DaysToExpiry'
    */
  readonly metricName?: string;
}

/**
 * Monitors an ACM certificate's expiration date. Tracks the days to expiry
 * metric published by ACM (until the certificate has expired), and also
 * inspects the certificate used by the provided `domainName` endpoint for
 * serving HTTPS webpages.
 *
 * These ensure ACM certificates are rotated by the time automated renewal would
 * have happened (60 to 45 days prior to expiration), and that the endpoint is
 * updated to a renewed certificate in due time.
 */
export class MonitoredCertificate extends Construct {
  /**
   * Alarms when the ACM certificate expiry is less than 45 days from now.
   */
  public readonly alarmAcmCertificateExpiresSoon: Alarm;

  /**
   * Alarms when the Endpoint certificate expiry is less than 45 days from now.
   */
  public readonly alarmEndpointCertificateExpiresSoon: Alarm;

  private readonly endpointMetricName: string;
  private readonly endpointMetricNamespace: string;

  public constructor(scope: Construct, id: string, private readonly props: MonitoredCertificateProps) {
    super(scope, id);

    this.endpointMetricName = props.metricName ?? 'DaysToExpiry';
    this.endpointMetricNamespace = props.metricNamespace ?? Stack.of(this).stackName;

    const dynamicMonitor = new CertificateMonitor(this, 'Monitor', {
      description: `Monitors the days to expiry of the certificate used to serve ${props.domainName}`,
      environment: {
        AWS_EMF_ENVIRONMENT: 'Local',
        HTTPS_ENDPOINT: props.domainName,
        METRIC_NAME: this.endpointMetricName,
        METRIC_NAMESPACE: this.endpointMetricNamespace,
      },
      memorySize: 1_024,
      timeout: Duration.minutes(5),
    });
    const rule = new Rule(this, 'Schedule', {
      description: `Executes the ${dynamicMonitor.functionName} function every 30 minutes`,
      schedule: Schedule.rate(Duration.minutes(30)),
      targets: [new LambdaFunction(dynamicMonitor)],
    });

    this.alarmAcmCertificateExpiresSoon = this.metricAcmCertificateDaysToExpiry()
      .createAlarm(this, 'ACMAlarm', {
        alarmDescription: `The ACM certificate ${props.certificate.certificateArn} will expire in less than 45 days!`,
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 45,
        treatMissingData: TreatMissingData.BREACHING,
      });

    this.alarmEndpointCertificateExpiresSoon = this.metricEndpointCertificateDaysToExpiry()
      .createAlarm(this, 'EndpointAlarm', {
        alarmDescription: `The certificate used to serve ${props.domainName} will expire in less than 45 days!`,
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 45,
        treatMissingData: TreatMissingData.BREACHING,
      });
    // Ensure we don't alarm before the function's trigger has been created...
    this.alarmEndpointCertificateExpiresSoon.node.addDependency(rule);
  }

  /**
   * The remaining days before the monitored certificate expires, as far as ACM
   * is concerned. This metric is no longer emitted after the certificate has
   * expired (alarms should treat missing data as `<= 0`).
   */
  public metricAcmCertificateDaysToExpiry(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.days(1),
      statistic: Statistic.MINIMUM,
      ...opts,
      dimensions: { CertificateArn: this.props.certificate.certificateArn },
      namespace: 'AWS/CertificateManager',
      metricName: 'DaysToExpiry',
      region: 'us-east-1', // <- ACM Certificates for CloudFront distributions are in us-east-1
    });
  }

  /**
   * The remaining days before the certificate served by the configured
   * `domainName` expires. This metric is published as 0 if the certificate has
   * already expired.
   */
  public metricEndpointCertificateDaysToExpiry(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.days(1),
      statistic: Statistic.MINIMUM,
      ...opts,
      dimensions: { DomainName: this.props.domainName },
      namespace: this.endpointMetricNamespace,
      metricName: this.endpointMetricName,
    });
  }
}
