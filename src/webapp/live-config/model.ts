/**
 * Specification for the home-config.json config file.
 */
export interface HomeConfigModel {
  /**
   * A version number for the configuration file.
   */
  readonly version: string;

  /**
   * Grouped sections of packages on the homepage.
   */
  readonly sections: Section[];
}

/**
 * Customization options for one section of the home page.
 */
interface Section {
  /**
   * The name of the section (displayed as a header).
   */
  readonly name: string;

  /**
   * Show the latest packages in this section.
   */
  readonly showLatest?: boolean;

  /**
   * The number of packages to show in this section. Must be used in
   * conjunction with `showLatest`.
   */
  readonly showCount?: number;

  /**
   * An explicit list of packages to display in the section. Mutually
   * exclusive with `showLatest`.
   */
  readonly packages?: Package[];
}

/**
 * Specification for a package to display.
 */
interface Package {
  /**
   * The name of the package, e.g. "@aws-cdk/core" or "cdk-watchful".
   */
  readonly name: string;
}
