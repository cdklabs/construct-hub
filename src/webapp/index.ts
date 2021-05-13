import * as path from 'path';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as origins from '@aws-cdk/aws-cloudfront-origins';
import * as r53 from '@aws-cdk/aws-route53';
import * as r53targets from '@aws-cdk/aws-route53-targets';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import { CfnOutput, Construct } from '@aws-cdk/core';
import { WebAppDomain } from '../construct-hub';

export interface WebAppProps {
  /**
   * Connect to a domain.
   * @default - uses the default CloudFront domain.
   */
  readonly domain?: WebAppDomain;
}

export class WebApp extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public constructor(scope: Construct, id: string, props: WebAppProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'WebsiteBucket');
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: { origin: new origins.S3Origin(this.bucket) },
      domainNames: props.domain ? [props.domain.zone.zoneName] : undefined,
      certificate: props.domain ? props.domain.cert : undefined,
      defaultRootObject: 'index.html',
      errorResponses: [404, 403].map(httpStatus => ( {
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
      })),
    });

    // if we use a domain, and A records with a CloudFront alias
    if (props.domain) {
      // IPv4
      new r53.ARecord(this, 'ARecord', {
        zone: props.domain.zone,
        target: r53.RecordTarget.fromAlias(new r53targets.CloudFrontTarget(this.distribution)),
        comment: 'Created by the AWS CDK',
      });

      // IPv6
      new r53.AaaaRecord(this, 'AaaaRecord', {
        zone: props.domain.zone,
        target: r53.RecordTarget.fromAlias(new r53targets.CloudFrontTarget(this.distribution)),
        comment: 'Created by the AWS CDK',
      });
    }

    // since `construct-hub-web` does not have an index file, we need to resolve
    // a specific file inside the module.
    const webappDir = path.join(__dirname, '..', '..', 'website');
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset(webappDir)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
    });

    new CfnOutput(this, 'DomainNAme', {
      value: this.distribution.domainName,
      exportName: 'ConstructHubDomainName',
    });
  }
}
