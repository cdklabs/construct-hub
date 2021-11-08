import * as path from 'path';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as origins from '@aws-cdk/aws-cloudfront-origins';
import * as r53 from '@aws-cdk/aws-route53';
import * as r53targets from '@aws-cdk/aws-route53-targets';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import { CacheControl } from '@aws-cdk/aws-s3-deployment';
import { CfnOutput, Construct, Duration } from '@aws-cdk/core';
import { Domain } from '../api';
import { PackageStats } from '../backend/package-stats';
import { CATALOG_KEY } from '../backend/shared/constants';
import { MonitoredCertificate } from '../monitored-certificate';
import { Monitoring } from '../monitoring';
import { WebappConfig, WebappConfigProps } from './config';
import { HomeResponseFunction } from './home-response-function';
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
  readonly showPackages?: FeaturedPackagesDetail[];
}

/**
 * Customization options for a specific package on the home page.
 */
export interface FeaturedPackagesDetail {
  /**
   * The name of the package.
   */
  readonly name: string;

  /**
   * An additional comment to include with the package.
   */
  readonly comment?: string;
}

/**
 * Enable/disable features for the web app.
 */
export interface FeatureFlags {
  readonly homeRedesign?: boolean;
  readonly searchRedesign?: boolean;
  [key: string]: any;
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

  /**
   * Manages the `stats.json` file object.
   */
  readonly packageStats?: PackageStats;
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
    const indexFunctionId = `IndexHeadersFunction${this.node.addr}`;

    const behaviorOptions: cloudfront.AddBehaviorOptions = {
      compress: true,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      functionAssociations: [{
        function: new ResponseFunction(this, functionId, {
          functionName: functionId,
        }),
        eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE,
      }],
    };

    const indexBehaviorOptions: cloudfront.AddBehaviorOptions = {
      compress: true,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      functionAssociations: [{
        function: new HomeResponseFunction(this, indexFunctionId, {
          functionName: indexFunctionId,
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
    this.distribution.addBehavior(`/${CATALOG_KEY}`, jsiiObjOrigin, behaviorOptions);
    if (props.packageStats) {
      this.distribution.addBehavior(`/${props.packageStats.statsKey}`, jsiiObjOrigin, behaviorOptions);
    }

    const websiteOrigin = new origins.S3Origin(this.bucket);
    this.distribution.addBehavior('/index.html', websiteOrigin, indexBehaviorOptions);

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
      cacheControl: [
        CacheControl.setPublic(),
        CacheControl.maxAge(Duration.hours(1)),
        CacheControl.mustRevalidate(),
        CacheControl.sMaxAge(Duration.minutes(5)),
        CacheControl.proxyRevalidate(),
      ],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      prune: false,
      sources: [s3deploy.Source.asset(webappDir)],
    });

    // Generate config.json to customize frontend behavior
    const config = new WebappConfig({
      packageLinks: props.packageLinks,
      packageTags: props.packageTags,
      featuredPackages: props.featuredPackages,
      showPackageStats: props.showPackageStats ?? props.packageStats !== undefined,
      featureFlags: props.featureFlags,
    });

    new s3deploy.BucketDeployment(this, 'DeployWebsiteConfig', {
      sources: [s3deploy.Source.asset(config.file.dir)],
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
