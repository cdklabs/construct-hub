import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export class TempFile {
  public readonly path: string;
  public readonly dir: string;
  public constructor(filename: string, content: string) {
    this.dir = mkdtempSync(join(tmpdir(), 'chtempfile'));
    this.path = join(this.dir, filename);
    writeFileSync(this.path, content);
  }
}
