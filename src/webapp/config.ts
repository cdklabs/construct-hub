import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PackageLinkConfig } from '.';

interface FrontendPackageLinkConfig {
  linkLabel: string;
  configKey: string;
  linkText?: string;
}

interface FrontendConfig {
  packageLinks?: FrontendPackageLinkConfig[];
}

interface WebappConfigProps {
  /**
   * Configuration for custom package page links.
   */
  readonly packageLinks?: PackageLinkConfig[];
}

export class WebappConfig {
  public readonly path: string;
  public readonly dir: string;
  public constructor(private readonly props: WebappConfigProps) {
    this.dir = mkdtempSync(join(tmpdir(), 'chwebapp'));
    this.path = join(this.dir, 'config.json');
    writeFileSync(this.path, JSON.stringify(this.frontendConfig));
  }

  private get frontendConfig(): FrontendConfig {
    const packageLinks = this.props.packageLinks ?? [];
    const withoutDomains = packageLinks.map(({ allowedDomains, ...rest }) => rest);
    return { packageLinks: withoutDomains };
  }
}
