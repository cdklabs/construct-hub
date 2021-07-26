import { IDistribution } from '@aws-cdk/aws-cloudfront';
import { Metric, MetricOptions, Statistic } from '@aws-cdk/aws-cloudwatch';
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { S3EventSource } from '@aws-cdk/aws-lambda-event-sources';
import { Bucket, EventType } from '@aws-cdk/aws-s3';
import { Construct, Duration, Token } from '@aws-cdk/core';
import { MetricName, METRICS_NAMESPACE } from './constants';
import { Handler } from './handler';

export interface CacheInvalidatorProps {
  /**
   * The S3 Bucket served by the CloudFront distribution.
   */
  readonly bucket: Bucket;

  /**
   * The CloudFront Distribution on which to perform automated invalidation.
   */
  readonly distribution: IDistribution;

  /**
   * A path prefix to prepend to S3 object keys when computing the cache
   * invalidation paths. The value is REQUIRED to begin with a leading `/`.
   *
   * @default '/'
   */
  readonly pathPrefix?: string;
}

/**
 * Automatically invalidates paths from a CloudFront distribution based on S3
 * object updates. The invalidated paths are constructed from the S3 object keys
 * being updated, combined with an optional path prefix.
 */
export class CacheInvalidator extends Construct {
  public constructor(scope: Construct, id: string, props: CacheInvalidatorProps) {
    super(scope, id);

    if (props.pathPrefix != null && !Token.isUnresolved(props.pathPrefix) && !props.pathPrefix.startsWith('/')) {
      throw new Error('The pathPrefix must start with a leading /');
    }

    const handler = new Handler(this, 'Resource', {
      description: `Automated cache invalidation on CloudFront distribution ${props.distribution.distributionId}`,
      environment: {
        DISTRIBUTION_ID: props.distribution.distributionId,
        PATH_PREFIX: props.pathPrefix ?? '/',
      },
      memorySize: 1_024,
      timeout: Duration.minutes(1),
    });

    handler.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['cloudfront:CreateInvalidation'],
      resources: ['*'], // CreateInvalidation does not support resource scoping
    }));

    // invalidate cache when a file was created/removed from the bucket
    handler.addEventSource(new S3EventSource(props.bucket, {
      events: [EventType.OBJECT_CREATED, EventType.OBJECT_REMOVED],
    }));
  }

  /**
   * The age of S3 events processed by the cache invalidator. By default this
   * is the MAXIMUM value over a 5 minutes period.
   */
  public metricS3EventAge(opts: MetricOptions): Metric {
    return new Metric({
      period: Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: MetricName.S3_EVENT_AGE,
      namespace: METRICS_NAMESPACE,
    });
  }
}
