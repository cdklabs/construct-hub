import {
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { S3_CLIENT } from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';

interface Input {
  ContinuationToken?: string;
}

interface Output {
  Contents: Array<{ Key: string }>;
  NextContinuationToken?: string;
}

/**
 * Lists objects in the storage bucket, returning only the Key field for each
 * object. This avoids the Step Functions 256KB payload limit that the direct
 * SDK integration can hit when S3 returns large responses with per-object
 * metadata (ETag, LastModified, Size, StorageClass, etc.).
 */
export async function handler(event: Input): Promise<Output> {
  console.log('Event: ', JSON.stringify(event, null, 2));

  const bucket = requireEnv('BUCKET_NAME');
  const prefix = requireEnv('PREFIX');
  const maxKeys = Number(requireEnv('MAX_KEYS'));

  const params: {
    Bucket: string;
    Prefix: string;
    MaxKeys: number;
    ContinuationToken?: string;
  } = {
    Bucket: bucket,
    Prefix: prefix,
    MaxKeys: maxKeys,
  };

  if (event.ContinuationToken) {
    params.ContinuationToken = event.ContinuationToken;
  }

  const response: ListObjectsV2CommandOutput = await S3_CLIENT.send(
    new ListObjectsV2Command(params)
  );

  const output: Output = {
    Contents: (response.Contents ?? []).map((obj) => ({ Key: obj.Key! })),
  };

  if (response.NextContinuationToken) {
    output.NextContinuationToken = response.NextContinuationToken;
  }

  console.log(
    `Listed ${output.Contents.length} objects, has more: ${!!output.NextContinuationToken}`
  );

  return output;
}
