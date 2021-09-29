import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FeaturedPackages, PackageLinkConfig } from '.';
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

type FrontendFeaturedPackagesConfig = FeaturedPackages;

interface FrontendConfig {
  packageLinks?: FrontendPackageLinkConfig[];
  packageTags?: FrontendPackageTagConfig[];
  featuredPackages?: FrontendFeaturedPackagesConfig;
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

  /**
   * Configuration for packages to feature on the home page.
   * @default - Display the 10 most recently updated packages
   */
  readonly featuredPackages?: FeaturedPackages;
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
      featuredPackages: this.featuredPackages,
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

  private get featuredPackages(): FrontendFeaturedPackagesConfig {
    const config = this.props.featuredPackages ?? {
      sections: [
        {
          name: 'Recently updated',
          showLastUpdated: 10,
        },
      ],
    };
    for (const section of config.sections) {
      if ((section.showPackages !== undefined && section.showLastUpdated !== undefined) ||
          (section.showPackages === undefined && section.showLastUpdated === undefined)) {
        throw new Error('Exactly one of \'showPackages\' and \'showPackages\' should be provided.');
      }
    }
    return config;
  }
}
