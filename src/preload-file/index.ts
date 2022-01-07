import { readFileSync } from 'fs';

export class PreloadFile {
  static fromFile(path: string): PreloadFile {
    const data = readFileSync(path, { encoding: 'utf-8' });
    return new PreloadFile(data);
  }

  static fromCode(code: string): PreloadFile {
    return new PreloadFile(code);
  }

  constructor(private readonly data: string) {}

  public bind(): string {
    return this.data;
  }
}