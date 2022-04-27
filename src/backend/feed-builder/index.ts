import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';

import { OverviewDashboard } from '../../overview-dashboard';
import {
  STORAGE_KEY_PREFIX,
  PACKAGE_RELEASE_NOTES_KEY_SUFFIX,
  CATALOG_KEY,
  CONSTRUCT_HUB_FEED_TITLE,
  CONSTRUCT_HUB_FEED_DESCRIPTION,
  FEED_ATOM_KEY,
  FEED_RSS_KEY,
  CONSTRUCT_HUB_URL_ENV_VAR_NAME,
} from '../shared/constants';
import { UpdateFeed } from './update-feed';

export interface FeedBuilderProps {
  /**
   * URL of construct hub used for deep linking from the RSS feed
   * @default - https://constructs.dev
   */
  readonly constructHubUrl?: string;

  /**
  * The package data storage bucket, where release-notes.md will be stored along with other assets
  */
  readonly bucket: s3.IBucket;

  /**
   * Title used in the generated RSS and Atom feed
   * @default - ConstructHub: Recent Packages
   */
  readonly feedTitle?: string;

  /**
   * Description used in the generated RSS and Atom feed
   * @default - Recent packages added to construct hub
   */
  readonly feedDescription?: string;

  /**
   * The overview dashboard to register dashboards with.
   */
  readonly overviewDashboard: OverviewDashboard;
}

export class FeedBuilder extends cdk.Construct {
  public readonly updateFeedFunction: lambda.Function;

  /**
   * Used to by lambda to read release notes and write the RSS/ATOM feeds
   */
  private readonly bucket: s3.IBucket;
  private constructHubUrl: string = 'https://constructs.dev';

  constructor(scope: cdk.Construct, id: string, props: FeedBuilderProps) {
    super(scope, id);

    this.bucket = props.bucket;

    this.updateFeedFunction = new UpdateFeed(this, 'ReleaseNotesUpdateFeed', {
      description: 'Release note RSS feed updater',
      environment: {
        CATALOG_BUCKET_NAME: this.bucket.bucketName,
        CATALOG_OBJECT_KEY: CATALOG_KEY,
        FEED_ENTRY_COUNT: '100',
      },
      timeout: cdk.Duration.minutes(1),
      reservedConcurrentExecutions: 1,
    });

    if (props.feedTitle) {
      this.updateFeedFunction.addEnvironment(
        CONSTRUCT_HUB_FEED_TITLE,
        props.feedTitle,
      );
    }

    if (props.feedDescription) {
      this.updateFeedFunction.addEnvironment(
        CONSTRUCT_HUB_FEED_DESCRIPTION,
        props.feedDescription,
      );
    }


    this.bucket.grantRead(this.updateFeedFunction, CATALOG_KEY);
    this.bucket.grantWrite(this.updateFeedFunction, FEED_ATOM_KEY);
    this.bucket.grantWrite(this.updateFeedFunction, FEED_RSS_KEY);
    this.bucket.grantRead(
      this.updateFeedFunction,
      `${STORAGE_KEY_PREFIX}*${PACKAGE_RELEASE_NOTES_KEY_SUFFIX}`,
    );
    props.overviewDashboard.addConcurrentExecutionMetricToDashboard(
      this.updateFeedFunction,
      'updateFeedFunction',
    );

    this.setConstructHubUrl(props.constructHubUrl);
  }

  public setConstructHubUrl(url?: string) {
    if (url) {
      this.constructHubUrl = url;
    }

    this.updateFeedFunction.addEnvironment(
      CONSTRUCT_HUB_URL_ENV_VAR_NAME,
      this.constructHubUrl,
    );
  }
}
