import { Readable } from 'stream';
import { StreamingBlobPayloadOutputTypes } from '@smithy/types';
import { sdkStreamMixin } from '@smithy/util-stream';

export function toStream(s: string | Buffer): StreamingBlobPayloadOutputTypes {
  const stream = new Readable();
  stream.push(s);
  stream.push(null);
  return sdkStreamMixin(stream) as StreamingBlobPayloadOutputTypes;
}
