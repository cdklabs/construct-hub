import * as path from 'path';
import * as certificatemanager from '@aws-cdk/aws-certificatemanager';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as origins from '@aws-cdk/aws-cloudfront-origins';
import * as route53 from '@aws-cdk/aws-route53';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import { Construct } from '@aws-cdk/core';

export interface WebAppProps {
  /**
   * The root domain name where this instance of Construct Hub will be served.
   */
  readonly hostedZone: route53.IHostedZone;

  /**
   * The certificate to use for serving the Construct Hub over a custom domain.
   *
   * @default - a DNS-Validated certificate will be provisioned using the
   *            provided `hostedZone`.
   */
  readonly tlsCertificate?: certificatemanager.ICertificate;

  /**
   * An optional path prefix to use for serving the Construct Hub.
   *
   * @default - none.
   */
  readonly pathPrefix?: string;
}

export class WebApp extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public constructor(scope: Construct, id: string, _props: WebAppProps) {
    super(scope, id);
    this.bucket = new s3.Bucket(this, 'WebsiteBucket', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: false
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: { origin: new origins.S3Origin(this.bucket) },
    });

    const webappDir = path.join(__dirname, '..', '..', 'node_modules', 'construct-hub-webapp', 'build');
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset(webappDir)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
    });
  }
}
