import { PutObjectCommand } from '@aws-sdk/client-s3';
import got from 'got';
import {
  NpmDownloadsClient,
  NpmDownloadsPeriod,
} from './npm-downloads.lambda-shared';
import { S3_CLIENT } from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';

interface ChunkInput {
  packages: string[];
  chunkIndex: number;
}

export async function handler(event: ChunkInput) {
  const { packages, chunkIndex } = event;
  const STATS_BUCKET_NAME = requireEnv('STATS_BUCKET_NAME');

  console.log(
    `Processing chunk ${chunkIndex} with ${packages.length} packages`
  );

  const npmClient = new NpmDownloadsClient(got);
  const npmDownloads = await npmClient.getDownloads(packages, {
    period: NpmDownloadsPeriod.LAST_WEEK,
    throwErrors: false,
  });

  const chunkStats: { [key: string]: { downloads: { npm: number } } } = {};

  for (const [pkgName, entry] of npmDownloads.entries()) {
    chunkStats[pkgName] = {
      downloads: {
        npm: entry.downloads,
      },
    };
  }

  // Store chunk result in S3
  const chunkKey = `stats-chunks/chunk-${chunkIndex}.json`;
  await S3_CLIENT.send(
    new PutObjectCommand({
      Bucket: STATS_BUCKET_NAME,
      Key: chunkKey,
      Body: JSON.stringify(chunkStats),
      ContentType: 'application/json',
    })
  );

  console.log(
    `Processed chunk ${chunkIndex}: ${
      Object.keys(chunkStats).length
    } packages with stats`
  );

  return {
    chunkIndex,
    chunkKey,
    packageCount: Object.keys(chunkStats).length,
  };
}
