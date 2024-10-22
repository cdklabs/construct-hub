import { text } from 'node:stream/consumers';
import { createGunzip, gzipSync } from 'zlib';
import type { NodeJsRuntimeStreamingBlobPayloadOutputTypes } from '@smithy/types';

const MINIMUM_SIZE_TO_COMPRESS = 1_024;

/**
 * Compresses the content of the provided `buffer` if it is large enough to
 * warrant the effort, and if the compressed output is actually smaller than
 * the input.
 *
 * @param buffer the buffer to be compressed.
 *
 * @returns the result of the operation.
 */
export function compressContent(buffer: Buffer): CompressContentResult {
  if (buffer.length < MINIMUM_SIZE_TO_COMPRESS) {
    return { buffer };
  }
  const gz = gzipSync(buffer, { level: 9 });
  // If it did not compress well, we'll keep the un-compressed original...
  if (gz.length >= buffer.length) {
    return { buffer };
  }
  return { buffer: gz, contentEncoding: 'gzip' };
}

/**
 * Decompresses a possibly gzip'ed blob stream into a string.
 *
 * @param data the data stream that needs transforming
 * @param encoding the encoding of the stream data
 * @returns the stream data as a string, decompressed if necessary
 */
export async function decompressContent(
  data: NodeJsRuntimeStreamingBlobPayloadOutputTypes,
  encoding?: string
): Promise<string> {
  if (encoding === 'gzip') {
    const gunzip = createGunzip();
    return text(data.pipe(gunzip));
  }

  return data.transformToString('utf-8');
}

/**
 * The result of a `compressContent` call.
 */
export interface CompressContentResult {
  /**
   * The possibly compressed buffer. This may be the un-modified input buffer.
   */
  readonly buffer: Buffer;

  /**
   * The content-encoding that should be applied to the object. This is
   * undefined if the input has not been modified.
   */
  readonly contentEncoding?: 'gzip';
}
