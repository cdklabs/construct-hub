import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface CustomLinkConfig {
  /**
   * The name of the link, appears before the ":"
   */
  readonly name: string;

  /**
   * The location of the value inside a module's package.json
   */
  readonly value: string;

  /**
   * optional text to display as the hyperlink text
   *
   * @default the url of the link
   */
  readonly displayText?: string;
}

interface WebAppBuilderConfig {
  /**
   * Whether to load client side analytics script.
   * @default false
   */
  readonly analytics?: boolean;

  /**
   * Whether FAQ is displayed or not
   * @default false
   */
  readonly faq?: boolean;

  /**
   * Custom package link config
   */
  readonly packageLinks?: CustomLinkConfig[];
}

export class WebAppBuilder {
  public readonly sourceDir: string;
  public readonly outDir: string;
  private readonly workingDir: string;
  public constructor(public readonly config: WebAppBuilderConfig) {
    const rootDir = path.join(__dirname, '..', '..');
    this.sourceDir = path.join(rootDir, 'node_modules', 'construct-hub-webapp');
    this.workingDir = fs.mkdtempSync(`${os.tmpdir()}${path.sep}`);
    this.outDir = path.join(this.workingDir, 'build');
    this.build();
  }

  private addRuntimeConfig() {
    fs.writeFileSync(path.join(this.outDir, 'config.json'), JSON.stringify({
      packageLinks: this.config.packageLinks ?? {},
    }));
  }

  private build() {
    // Install app dependencies
    // setup working directory
    childProcess.execSync(
      `
      #!/bin/bash
      rm -rf ${this.outDir}
      cp -r ${this.sourceDir}/* ${this.workingDir}
      `,
      {
        stdio: 'inherit',
      },
    );

    // We pass config values as build time environment variables to react-scripts
    const { analytics, faq } = this.config;
    const env = {
      ...process.env,
      REACT_APP_HAS_ANALYTICS: analytics ? 'true' : 'false',
      REACT_APP_FAQ: faq ? 'true' : 'false',
      DISABLE_ESLINT_PLUGIN: 'true',
    };
    childProcess.execSync(
      `
        yarn install
        npx react-app-rewired build
      `,
      { stdio: 'inherit', env, cwd: this.workingDir },
    );

    this.addRuntimeConfig();
  }
}
