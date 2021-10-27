import * as fs from 'fs';
import * as internal from 'stream';

export async function writeFile(filePath: string, readStream: internal.Readable): Promise<boolean> {
  return new Promise((ok, ko) => {
    const writeStream = fs.createWriteStream(filePath);
    readStream.pipe(writeStream);
    writeStream.on('error', ko);
    writeStream.on('finish', () => {
      ok(true);
    });
  });
}
