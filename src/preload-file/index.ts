import { readFileSync } from 'fs';

/**
 * Represents a javascript file to load before the webapp.
 * This can allow operators to add their own client monitors or analytics if they wish
 */
export class PreloadFile {
  /**
   * Creates a PreloadFile instance from a filepath to load
   */
  static fromFile(path: string): PreloadFile {
    const data = readFileSync(path, { encoding: 'utf-8' });
    return new PreloadFile(data);
  }

  /**
   * Creates a PreloadFile instance directly from source code
   */
  static fromCode(code: string): PreloadFile {
    return new PreloadFile(code);
  }

  constructor(private readonly data: string) {}

  public bind(): string {
    return this.data;
  }
}
