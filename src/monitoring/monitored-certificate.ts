import { ICertificate } from '@aws-cdk/aws-certificatemanager';
import { ComparisonOperator, Metric, MetricOptions, Statistic, TreatMissingData } from '@aws-cdk/aws-cloudwatch';
import { Construct, Duration, Stack } from '@aws-cdk/core';
import type { IMonitoredCertificate, Monitoring } from '.';
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
   * The monitoring instance that owns this certificate monitor.
   */
  readonly monitoring: Monitoring;

  /**
   * The namespace within which to emit the metric.
   *
   * @default Stack.of(this).stackName
   */
   readonly metricNamespace?: string;

   /**
    * The name of the CloudWatch metric to be emitted.
    *
    * @default 'DaysToExpiry'
    */
   readonly metricName?: string;
}

export class MonitoredCertificate extends Construct implements IMonitoredCertificate {
  private readonly customMetricName: string;
  private readonly customMetricNamespace: string;

  public constructor(scope: Construct, id: string, private readonly props: MonitoredCertificateProps) {
    super(scope, id);

    this.customMetricName = props.metricName ?? 'DaysToExpiry';
    this.customMetricNamespace = props.metricNamespace ?? Stack.of(this).stackName;

    const dynamicMonitor = new CertificateMonitor(this, `${props.certificate.node.addr}::Monitor`, {
      description: `Monitors the days to expiry of the certificate used to serve ${props.domainName}`,
      environment: {
        HTTPS_ENDPOINT: props.domainName,
        METRIC_NAMESPACE: this.customMetricNamespace,
        METRIC_NAME: this.customMetricName,
      },
      memorySize: 1_024,
      timeout: Duration.minutes(30),
    });

    const acmAlarm = this.metricAcmCertificateDaysToExpiry()
      .createAlarm(this, 'ACMAlarm', {
        alarmDescription: `The ACM certificate ${props.certificate.certificateArn} will expire in less than 45 days!`,
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 45,
        treatMissingData: TreatMissingData.BREACHING,
      });

    const endpointAlarm = this.metricEndpointCertificateDaysToExpiry()
      .createAlarm(this, 'EndpointAlarm', {
        alarmDescription: `The certificate used to serve ${props.domainName} will expire in less than 45 days!`,
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 1,
        threshold: 45,
        treatMissingData: TreatMissingData.BREACHING,
      });
    endpointAlarm.node.addDependency(dynamicMonitor);

    props.monitoring.addHighSeverityAlarm('ACM Certificate will expire soon!', acmAlarm);
    props.monitoring.addHighSeverityAlarm('Endpoint certificate will expire soon!', endpointAlarm);
  }

  /**
   * The remaining days before the monitored certificate expires, as far as ACM
   * is concerned. This metric is no longer emitted after the certificate has
   * expired (alarms should treat missing data as `<= 0`).
   */
  public metricAcmCertificateDaysToExpiry(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.hours(1),
      statistic: Statistic.MINIMUM,
      ...opts,
      dimensions: { CertificateArn: this.props.certificate.certificateArn },
      namespace: 'AWS/CertificateManager',
      metricName: 'DaysToExpiry',
    });
  }

  /**
   * The remaining days before the certificate served by the configured
   * `domainName` expires. This metric is published as 0 if the certificate has
   * already expired.
   */
  public metricEndpointCertificateDaysToExpiry(opts?: MetricOptions): Metric {
    return new Metric({
      period: Duration.hours(1),
      statistic: Statistic.MINIMUM,
      ...opts,
      dimensions: { DomainName: this.props.domainName },
      namespace: this.customMetricNamespace,
      metricName: this.customMetricName,
    });
  }
}
