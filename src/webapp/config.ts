import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PackageLinkConfig } from '.';
import { PackageTagConfig } from '../package-tag';

interface FrontendPackageLinkConfig {
  linkLabel: string;
  configKey: string;
  linkText?: string;
}

interface FrontendPackageTagConfig {
  label: string;
  color?: string;
}

interface FrontendConfig {
  packageLinks?: FrontendPackageLinkConfig[];
  packageTags?: FrontendPackageTagConfig[];
}

interface WebappConfigProps {
  /**
   * Configuration for custom package page links.
   */
  readonly packageLinks?: PackageLinkConfig[];

  /**
   * Configuration for custom computed tags.
   */
  readonly packageTags?: PackageTagConfig[];
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
    return {
      packageLinks: this.packageLinks,
      packageTags: this.packageTags,
    };
  }

  private get packageLinks(): FrontendPackageLinkConfig[] {
    const packageLinks = this.props.packageLinks ?? [];
    // remove allowed domains from frontend config
    return packageLinks.map(({ allowedDomains, ...rest }) => rest);
  }

  private get packageTags(): FrontendPackageTagConfig[] {
    const packageTags = this.props.packageTags ?? [];
    // remove conditional logic from frontend config
    return packageTags.map(({ condition, ...rest }) => rest);
  }
}
