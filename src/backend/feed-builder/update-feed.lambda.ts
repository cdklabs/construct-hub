import {
  GetObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Feed } from 'feed';
import type * as MarkdownIt from 'markdown-it';

import { CacheStrategy } from '../../caching';
import { CatalogClient } from '../catalog-builder/client.lambda-shared';
import { S3_CLIENT } from '../shared/aws.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';

export const handler = async () => {
  const bucket = requireEnv('CATALOG_BUCKET_NAME');
  requireEnv('CATALOG_OBJECT_KEY');
  const feedTitle =
    process.env[constants.CONSTRUCT_HUB_FEED_TITLE] ||
    'ConstructHub: Recent Packages';
  const feedDescription =
    process.env[constants.CONSTRUCT_HUB_FEED_DESCRIPTION] ||
    'Recent packages added to construct hub';
  const baseUrl = requireEnv(constants.CONSTRUCT_HUB_URL_ENV_VAR_NAME);
  const FEED_ENTRY_COUNT = Number.parseFloat(requireEnv('FEED_ENTRY_COUNT'));

  if (!Number.isInteger(FEED_ENTRY_COUNT)) {
    throw new Error('FEED_ENTRY_COUNT should be an integer');
  }

  console.log('Initializing catalog client');
  const catalogClient = await CatalogClient.newClient();
  console.log('Initialized package client');

  const packages = [...catalogClient.packages];
  console.log(`found ${packages.length} packages in catalog`);

  // Reverse chronologically sorted  by publish date packages
  const feedPackages = packages
    .sort((a, b) => {
      const aDate = a.metadata?.date ? new Date(a.metadata.date).getTime() : 0;
      const bDate = b.metadata?.date ? new Date(b.metadata.date).getTime() : 0;
      // b - a for descending sort
      return bDate - aDate;
    })
    .slice(0, FEED_ENTRY_COUNT);

  const feed = new Feed({
    title: feedTitle,
    description: feedDescription,
    favicon: `${baseUrl}/apple-touch-icon.png`,
    id: `${baseUrl}/recent-packages`,
    link: `${baseUrl}/atom`,
    copyright: ' Amazon Web Services, Inc. All rights reserved',
    generator: 'construct-hub',
  });

  for (const pkg of feedPackages) {
    console.log(`adding package ${pkg.name}@${pkg.version}`);
    const content = await getPackageReleaseNotes(pkg.name, pkg.version);
    const title = `${pkg.name}@${pkg.version}`;
    const link = `${baseUrl}/packages/${pkg.name}/v/${pkg.version}`;
    const releaseDate = pkg.metadata?.date
      ? new Date(pkg.metadata.date)
      : new Date();
    const author = [
      {
        name: pkg.author?.name,
        link: pkg.author?.url,
        email: pkg.author?.email,
      },
    ];
    feed.addItem({
      title,
      date: releaseDate,
      link,
      author,
      content,
    });
  }

  console.log('Saving feed data to s3 bucket');
  try {
    await S3_CLIENT.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: constants.FEED_ATOM_KEY,
        Body: feed.atom1(),
        ContentType: 'application/atom+xml',
        CacheControl: CacheStrategy.default().toString(),
      })
    );

    await S3_CLIENT.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: constants.FEED_RSS_KEY,
        Body: feed.rss2(),
        ContentType: 'application/xml',
        CacheControl: CacheStrategy.default().toString(),
      })
    );
    console.log('Done saving feed to s3');
  } catch (e) {
    throw new Error(`Unable to save feed to S3: ${e}`);
  }
};

export const getPackageReleaseNotes = async (
  packageName: string,
  packageVersion: string
): Promise<string> => {
  // Using dynamic import to ensure JSII doesnot complain about esModuleInterop
  const markDownIt = await import('markdown-it');
  const emoji = await import('markdown-it-emoji');
  const bucket = requireEnv('CATALOG_BUCKET_NAME');
  // Common JS module. So calling default. Jest does the esModule interops so no default
  const markdown: MarkdownIt = ((markDownIt as any).default || markDownIt)();
  markdown.use((emoji as any).default || emoji);
  const { releaseNotesKey } = constants.getObjectKeys(
    packageName,
    packageVersion
  );
  try {
    console.log(`Getting release notes for ${packageName}@${packageVersion}`);
    const releaseNotesContent = await S3_CLIENT.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: releaseNotesKey,
      })
    );
    console.log(`Done reading ${packageName}@${packageVersion}`);
    const releaseNotes = markdown.render(
      (await releaseNotesContent.Body?.transformToString()) || ''
    );
    console.log('release notes:', releaseNotes);
    return releaseNotes;
  } catch (error: any) {
    if (
      error instanceof NotFound ||
      error.name === 'NotFound' ||
      error instanceof NoSuchKey ||
      error.name === 'NoSuchKey'
    ) {
      return 'No release notes';
    }
    throw error;
  }
};
