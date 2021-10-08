import * as path from 'path';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as origins from '@aws-cdk/aws-cloudfront-origins';
import * as r53 from '@aws-cdk/aws-route53';
import * as r53targets from '@aws-cdk/aws-route53-targets';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import { CfnOutput, Construct } from '@aws-cdk/core';
import { Domain } from '../api';
import { MonitoredCertificate } from '../monitored-certificate';
import { Monitoring } from '../monitoring';
import { CacheInvalidator } from './cache-invalidator';
import { WebappConfig, WebappConfigProps } from './config';
import { ResponseFunction } from './response-function';

export interface PackageLinkConfig {
  /**
   * The name of the link, appears before the ":" on the website
   */
  readonly linkLabel: string;

  /**
   * The location of the value inside the constructHub.packageLinks
   * key of a module's package.json
   */
  readonly configKey: string;

  /**
   * optional text to display as the hyperlink text
   *
   * @default the url of the link
   */
  readonly linkText?: string;

  /**
   * allowList of domains for this link
   *
   * @default all domains allowed
   */
  readonly allowedDomains?: string[];
}

/**
 * Configuration for packages to feature on the home page.
 */
export interface FeaturedPackages {
  /**
   * Grouped sections of packages on the homepage.
   */
  readonly sections: FeaturedPackagesSection[];
}

/**
 * Customization options for one section of the home page.
 */
export interface FeaturedPackagesSection {
  /**
   * The name of the section (displayed as a header).
   */
  readonly name: string;

  /**
   * Show the N most recently updated packages in this section.
   * Cannot be used with `showPackages`.
   */
  readonly showLastUpdated?: number;

  /**
   * Show an explicit list of packages.
   * Cannot be used with `showLastUpdated`.
   */
  readonly showPackages?: string[];
}

export interface WebAppProps extends WebappConfigProps {
  /**
   * Connect to a domain.
   * @default - uses the default CloudFront domain.
   */
  readonly domain?: Domain;

  /**
   * Monitoring system.
   */
  readonly monitoring: Monitoring;

  /**
   * The bucket containing package data.
   */
  readonly packageData: s3.Bucket;
}

export class WebApp extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public constructor(scope: Construct, id: string, props: WebAppProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'WebsiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // generate a stable unique id for the cloudfront function and use it
    // both for the function name and the logical id of the function so if
    // it is changed the function will be recreated.
    // see https://github.com/aws/aws-cdk/issues/15523
    const functionId = `AddHeadersFunction${this.node.addr}`;

    const behaviorOptions = {
      compress: true,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      functionAssociations: [{
        function: new ResponseFunction(this, functionId, {
          functionName: functionId,
        }),
        eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE,
      }],
    };

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: { origin: new origins.S3Origin(this.bucket), ...behaviorOptions },
      domainNames: props.domain ? [props.domain.zone.zoneName] : undefined,
      certificate: props.domain ? props.domain.cert : undefined,
      defaultRootObject: 'index.html',
      errorResponses: [404, 403].map(httpStatus => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
      })),
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2018,
    });

    const jsiiObjOrigin = new origins.S3Origin(props.packageData);
    this.distribution.addBehavior('/data/*', jsiiObjOrigin, behaviorOptions);
    this.distribution.addBehavior('/catalog.json', jsiiObjOrigin, behaviorOptions);

    new CacheInvalidator(this, 'CacheInvalidator', { bucket: props.packageData, distribution: this.distribution });

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

      // Monitor certificate expiration
      if (props.domain.monitorCertificateExpiration ?? true) {
        const monitored = new MonitoredCertificate(this, 'ExpirationMonitor', {
          certificate: props.domain.cert,
          domainName: props.domain.zone.zoneName,
        });
        props.monitoring.addHighSeverityAlarm('ACM Certificate Expiry', monitored.alarmAcmCertificateExpiresSoon);
        props.monitoring.addHighSeverityAlarm('Endpoint Certificate Expiry', monitored.alarmEndpointCertificateExpiresSoon);
      }
    }

    // "website" contains the static react app
    const webappDir = path.join(__dirname, '..', '..', 'website');

    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset(webappDir)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      prune: false,
    });

    // Generate config.json to customize frontend behavior
    const config = new WebappConfig({
      packageLinks: props.packageLinks,
      packageTags: props.packageTags,
      featuredPackages: props.featuredPackages,
      packageStats: props.packageStats,
    });

    new s3deploy.BucketDeployment(this, 'DeployWebsiteConfig', {
      sources: [s3deploy.Source.asset(config.dir)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      prune: false,
    });

    new CfnOutput(this, 'DomainName', {
      value: this.distribution.domainName,
      exportName: 'ConstructHubDomainName',
    });

    // add a canary that pings our home page and alarms if it returns errors.
    props.monitoring.addWebCanary('Home Page', `https://${this.distribution.domainName}`);
  }
}
