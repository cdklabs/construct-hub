import * as acm from '@aws-cdk/aws-certificatemanager';
import * as cf from '@aws-cdk/aws-cloudfront';
import * as origins from '@aws-cdk/aws-cloudfront-origins';
import * as route53 from '@aws-cdk/aws-route53';
import * as route53_targets from '@aws-cdk/aws-route53-targets';
import * as s3 from '@aws-cdk/aws-s3';
import { Construct as CoreConstruct } from '@aws-cdk/core';
import { Construct } from 'constructs';

/**
 * Props for `DomainRedirect`.
 */
export interface DomainRedirectProps {
  /**
   * Source hosted zone.
   */
  readonly source: DomainRedirectSource;

  /**
   * The domain name to redirect to (e.g. `foo.com`).
   */
  readonly targetDomainName: string;
}

/**
 * Redirects one domain to another domain using S3 and CloudFront.
 */
export class DomainRedirect extends CoreConstruct {
  constructor(scope: Construct, id: string, props: DomainRedirectProps) {
    super(scope, id);

    const bucket = new s3.Bucket(this, 'Bucket', {
      websiteRedirect: {
        hostName: props.targetDomainName,
      },
    });

    const sourceDomainName = props.source.hostedZone.zoneName;

    const cert = props.source.certificate ?? new acm.DnsValidatedCertificate(this, 'Certificate', {
      domainName: sourceDomainName,
      hostedZone: props.source.hostedZone,
    });

    const dist = new cf.Distribution(this, 'Distribution', {
      domainNames: [sourceDomainName],
      defaultBehavior: { origin: new origins.S3Origin(bucket) },
      certificate: cert,
    });

    // IPv4
    new route53.ARecord(this, 'ARecord', {
      zone: props.source.hostedZone,
      target: route53.RecordTarget.fromAlias(new route53_targets.CloudFrontTarget(dist)),
      comment: 'Created by the AWS CDK',
    });

    // IPv6
    new route53.AaaaRecord(this, 'AaaaRecord', {
      zone: props.source.hostedZone,
      target: route53.RecordTarget.fromAlias(new route53_targets.CloudFrontTarget(dist)),
      comment: 'Created by the AWS CDK',
    });
  }
}

/**
 * Source domain of the redirect.
 */
export interface DomainRedirectSource {
  /**
   * The route53 zone which hosts the source domain.
   */
  readonly hostedZone: route53.IHostedZone;

  /**
   * The ACM certificate to use for the CloudFront distribution.
   * @default - a certificate is created for this domain.
   */
  readonly certificate?: acm.ICertificate;
}
