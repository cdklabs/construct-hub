import { Alarm, TreatMissingData } from '@aws-cdk/aws-cloudwatch';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import { Construct, Duration } from '@aws-cdk/core';
import { HttpGetFunction } from './http-get-function';

/**
 * Props for `WebCanary`.
 */
export interface WebCanaryProps {
  /**
   * Display name for the web canary
   */
  readonly displayName: string;

  /**
   * The URL of the website to ping.
   */
  readonly url: string;
}

/**
 * A canary that periodically sends an HTTP GET request to a specific URL.
 */
export class WebCanary extends Construct {
  /**
   * This alarm is raised if there are more than 2 failures within 5 minutes.
   */
  public readonly alarm: Alarm;

  constructor(scope: Construct, id: string, props: WebCanaryProps) {
    super(scope, id);

    const url = props.url;
    const display = props.displayName;

    const ping = new HttpGetFunction(this, 'HttpGetFunction', {
      description: `HTTP GET ${url}: ${display}`,
      environment: { URL: url },
    });

    // invoke every 1min
    new events.Rule(this, 'Rule', {
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [new targets.LambdaFunction(ping)],
    });

    // total number of errors every 5 minutes
    const errors = ping.metricErrors({
      period: Duration.minutes(5),
      statistic: 'sum',
      label: `${url} Errors`,
    });

    // alarm if 4 or more pings have failed within a period of 5 minutes (80% failure rate)
    this.alarm = errors.createAlarm(this, 'Errors', {
      alarmDescription: `80% error rate for ${props.url} (${display})`,
      threshold: 4,
      evaluationPeriods: 1,
      treatMissingData: TreatMissingData.BREACHING,
    });
  }
}