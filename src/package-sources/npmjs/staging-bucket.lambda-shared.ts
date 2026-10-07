import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import type {
  NodeJsRuntimeStreamingBlobPayloadOutputTypes,
  StreamingBlobPayloadInputTypes,
} from '@smithy/types';
import type { Context } from 'aws-lambda';
import { S3_CLIENT } from '../../backend/shared/aws.lambda-shared';
import { decompressContent } from '../../backend/shared/compress-content.lambda-shared';

/**
 * The legacy transaction marker file format, kept around to seed the follower
 * state (and known versions) of existing deployments.
 *
 * The file can be a just a number, or a combination of a sequence number (which
 * is potentially encoded as a string) and a set of known versions and the dates
 * we first saw them. The date can be encoded as an ISO string, or a timestamp
 * number.
 */
export type MarkerFileSchema =
  | number
  | {
      marker: number | string;
      knownVersions?: Record<string, string | number>;
    };

/**
 * Common function to load data from an S3 file with error handling
 *
 * @param stagingBucket The S3 bucket name
 * @param key The file key in the bucket
 * @param warningMessage Message to log when file doesn't exist
 * @returns The decompressed file content as string, or null if file doesn't exist
 */
export async function loadContentFromS3(
  stagingBucket: string,
  key: string,
  warningMessage: string
): Promise<string | null> {
  try {
    const response = await S3_CLIENT.send(
      new GetObjectCommand({
        Bucket: stagingBucket,
        Key: key,
      })
    );
    if (!response.Body) {
      throw new Error(`Response Body for ${key} is empty`);
    }
    return await decompressContent(
      response.Body as NodeJsRuntimeStreamingBlobPayloadOutputTypes,
      response.ContentEncoding
    );
  } catch (error: any) {
    if (error instanceof NoSuchKey || error.name === 'NoSuchKey') {
      console.warn(warningMessage);
      return null;
    }
    // re-throw unexpected errors
    throw error;
  }
}

/**
 * Puts an object in the staging bucket, with standardized object metadata.
 *
 * @param key  the key for the object to be put.
 * @param body the body of the object to be put.
 * @param opts any other options to use when sending the S3 request.
 *
 * @returns the result of the S3 request.
 */
export function putObject(
  context: Context,
  bucket: string,
  key: string,
  body: StreamingBlobPayloadInputTypes,
  opts: Omit<PutObjectCommandInput, 'Bucket' | 'Key' | 'Body'> = {}
) {
  return S3_CLIENT.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      Metadata: {
        'Lambda-Log-Group': context.logGroupName,
        'Lambda-Log-Stream': context.logStreamName,
        'Lambda-Run-Id': context.awsRequestId,
        ...opts.Metadata,
      },
      ...opts,
    })
  );
}
