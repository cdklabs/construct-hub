import * as path from 'path';
import { CfnOutput } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as r53 from 'aws-cdk-lib/aws-route53';
import * as r53targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { Domain } from '../api';
import { PackageStats } from '../backend/package-stats';
import {
  CATALOG_KEY,
  VERSION_TRACKER_KEY,
  FEED_RSS_KEY,
  FEED_ATOM_KEY,
  BADGE_KEY,
} from '../backend/shared/constants';
import { CacheStrategy } from '../caching';
import { MonitoredCertificate } from '../monitored-certificate';
import { Monitoring } from '../monitoring';
import { OverviewDashboard } from '../overview-dashboard';
import { PreloadFile } from '../preload-file';
import { S3StorageFactory } from '../s3/storage';
import { TempFile } from '../temp-file';
import { BadgeRedirectFunction } from './badge-redirect-function';
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

/**
 * A category of packages.
 */
export interface Category {
  /**
   * The title on the category button as it appears in the Construct Hub home page.
   */
  readonly title: string;

  /**
   * The URL that this category links to. This is the full path to the link that
   * this category button will have. You can use any query options such as
   * `?keywords=`, `?q=`, or a combination thereof.
   *
   * @example "/search?keywords=monitoring"
   */
  readonly url: string;
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
   * overview dashboard.
   */
  readonly overviewDashboard: OverviewDashboard;

  /**
   * The bucket containing package data.
   */
  readonly packageData: s3.Bucket;

  /**
   * Manages the `stats.json` file object.
   */
  readonly packageStats?: PackageStats;

  /**
   * JavaScript file which will be loaded before the webapp
   */
  readonly preloadScript?: PreloadFile;

  /**
   * Include <link> tag for ATOM and RSS feeds to the web app's head metadata
   */
  readonly includeFeedLink?: boolean;
}

export class WebApp extends Construct {
  public readonly baseUrl: string;
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  public constructor(scope: Construct, id: string, props: WebAppProps) {
    super(scope, id);

    const storageFactory = S3StorageFactory.getOrCreate(this);
    this.bucket = storageFactory.newBucket(this, 'WebsiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // generate a stable unique id for the cloudfront functions and use it
    // both for the function name and the logical id of the function so if
    // it is changed the function will be recreated.
    // see https://github.com/aws/aws-cdk/issues/15523
    const functionId = `AddHeadersFunction${this.node.addr}`;
    const badgeRedirectId = `BadgeRedirectFunction${this.node.addr}`;

    const behaviorOptions: cloudfront.AddBehaviorOptions = {
      compress: true,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      functionAssociations: [
        {
          function: new ResponseFunction(this, functionId, {
            functionName: functionId,
          }),
          eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE,
        },
      ],
    };

    const websiteOrigin = new origins.S3Origin(this.bucket);
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: websiteOrigin,
        ...behaviorOptions,
      },
      domainNames: props.domain ? [props.domain.zone.zoneName] : undefined,
      certificate: props.domain ? props.domain.cert : undefined,
      defaultRootObject: 'index.html',
      errorResponses: [404, 403].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
      })),
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2018,
    });

    props.overviewDashboard.addDistributionMetricToDashboard(this.distribution);

    // The base URL is currently the custom DNS if any was used, or the distribution domain name.
    // This needs changing in case, for example, we add support for a custom URL prefix.
    this.baseUrl = `https://${
      props.domain
        ? props.domain.zone.zoneName
        : this.distribution.distributionDomainName
    }`;

    const jsiiObjOrigin = new origins.S3Origin(props.packageData);
    this.distribution.addBehavior('/data/*', jsiiObjOrigin, behaviorOptions);
    this.distribution.addBehavior(
      `/${CATALOG_KEY}`,
      jsiiObjOrigin,
      behaviorOptions
    );
    this.distribution.addBehavior(
      `/${VERSION_TRACKER_KEY}`,
      jsiiObjOrigin,
      behaviorOptions
    );

    this.distribution.addBehavior(`/${BADGE_KEY}`, websiteOrigin, {
      compress: true,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      functionAssociations: [
        {
          function: new BadgeRedirectFunction(this, badgeRedirectId, {
            functionName: badgeRedirectId,
          }),
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        },
      ],
    });

    if (props.includeFeedLink) {
      this.distribution.addBehavior(
        `/${FEED_ATOM_KEY}`,
        jsiiObjOrigin,
        behaviorOptions
      );
      this.distribution.addBehavior(
        `/${FEED_RSS_KEY}`,
        jsiiObjOrigin,
        behaviorOptions
      );
    }

    if (props.packageStats) {
      this.distribution.addBehavior(
        `/${props.packageStats.statsKey}`,
        jsiiObjOrigin,
        behaviorOptions
      );
    }

    // if we use a domain, and A records with a CloudFront alias
    if (props.domain) {
      // IPv4
      new r53.ARecord(this, 'ARecord', {
        zone: props.domain.zone,
        target: r53.RecordTarget.fromAlias(
          new r53targets.CloudFrontTarget(this.distribution)
        ),
        comment: 'Created by the AWS CDK',
      });

      // IPv6
      new r53.AaaaRecord(this, 'AaaaRecord', {
        zone: props.domain.zone,
        target: r53.RecordTarget.fromAlias(
          new r53targets.CloudFrontTarget(this.distribution)
        ),
        comment: 'Created by the AWS CDK',
      });

      // Monitor certificate expiration
      if (props.domain.monitorCertificateExpiration ?? true) {
        const monitored = new MonitoredCertificate(this, 'ExpirationMonitor', {
          certificate: props.domain.cert,
          domainName: props.domain.zone.zoneName,
        });
        props.monitoring.addHighSeverityAlarm(
          'ACM Certificate Expiry',
          monitored.alarmAcmCertificateExpiresSoon
        );
        props.monitoring.addHighSeverityAlarm(
          'Endpoint Certificate Expiry',
          monitored.alarmEndpointCertificateExpiresSoon
        );
      }
    }

    // "website" contains the static react app
    const webappDir = path.join(__dirname, '..', '..', 'website');

    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      destinationBucket: this.bucket,
      distribution: this.distribution,
      prune: false,
      sources: [s3deploy.Source.asset(webappDir)],
      cacheControl: CacheStrategy.default().toArray(),
    });

    // Generate config.json to customize frontend behavior
    const config = new WebappConfig({
      packageLinks: props.packageLinks,
      packageTags: props.packageTags,
      packageTagGroups: props.packageTagGroups,
      featuredPackages: props.featuredPackages,
      showPackageStats:
        props.showPackageStats ?? props.packageStats !== undefined,
      featureFlags: props.featureFlags,
      categories: props.categories,
      feedConfig: props.includeFeedLink
        ? [
            {
              mimeType: 'application/atom+xml',
              url: `/${FEED_ATOM_KEY}`,
            },
            {
              mimeType: 'application/rss+xml',
              url: `/${FEED_RSS_KEY}`,
            },
          ]
        : undefined,
    });

    // Generate preload.js
    const preloadScript = new TempFile(
      'preload.js',
      props.preloadScript?.bind() ?? ''
    );

    new s3deploy.BucketDeployment(this, 'DeployWebsiteConfig', {
      sources: [
        s3deploy.Source.asset(config.file.dir),
        s3deploy.Source.asset(preloadScript.dir),
      ],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      prune: false,
      cacheControl: CacheStrategy.default().toArray(),
    });

    new CfnOutput(this, 'DomainName', {
      value: this.distribution.domainName,
      exportName: 'ConstructHubDomainName',
    });

    // add a canary that pings our home page and alarms if it returns errors.
    props.monitoring.addWebCanary(
      'Home Page',
      `https://${this.distribution.domainName}`
    );
  }
}
