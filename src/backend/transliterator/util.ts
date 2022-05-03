import * as fs from 'fs';
import * as internal from 'stream';

export async function writeFile(
  filePath: string,
  readStream: internal.Readable
): Promise<void> {
  return new Promise<void>((ok, ko) => {
    const writeStream = fs.createWriteStream(filePath);
    readStream.pipe(writeStream);
    readStream.once('error', ko);
    writeStream.once('error', ko);
    writeStream.once('finish', () => {
      ok();
    });
  });
}
