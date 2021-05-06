import * as path from 'path';
import * as certificatemanager from '@aws-cdk/aws-certificatemanager';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as origins from '@aws-cdk/aws-cloudfront-origins';
import * as route53 from '@aws-cdk/aws-route53';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import { CfnOutput, Construct } from '@aws-cdk/core';

export interface WebAppProps {
  /**
   * Connect to a domain.
   * @default - uses the default CloudFront domain.
   */
  readonly domain?: WebAppDomain;
}

export interface WebAppDomain {
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
    });

    // since `construct-hub-web` does not have an index file, we need to resolve
    // a specific file inside the module.
    const webappDir = path.dirname(require.resolve('construct-hub-webapp/build/index.html'));
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
