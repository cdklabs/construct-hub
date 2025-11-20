import { GetObjectCommand } from '@aws-sdk/client-s3';
import { S3_CLIENT } from '../shared/aws.lambda-shared';
import { decompressContent } from '../shared/compress-content.lambda-shared';

export interface ReadUninstallableReportEvent {
  readonly bucket: string;
  readonly key: string;
}

export interface ReadUninstallableReportResult {
  readonly packages: string[];
}

export async function handler(
  event: ReadUninstallableReportEvent
): Promise<ReadUninstallableReportResult> {
  const response = await S3_CLIENT.send(
    new GetObjectCommand({
      Bucket: event.bucket,
      Key: event.key,
    })
  );

  if (!response.Body) {
    throw new Error(`Object not found: s3://${event.bucket}/${event.key}`);
  }

  const decompressed = await decompressContent(
    response.Body as any,
    response.ContentEncoding
  );

  const packages = JSON.parse(decompressed);
  return { packages };
}
