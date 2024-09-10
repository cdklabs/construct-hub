import { Readable } from 'stream';
import { sdkStreamMixin } from '@smithy/util-stream';

export function stringToStream(s: string): any {
  const stream = new Readable();
  stream.push(s);
  stream.push(null);
  return sdkStreamMixin(stream);
}
