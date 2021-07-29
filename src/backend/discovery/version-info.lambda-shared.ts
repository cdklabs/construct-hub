/**
 * The scheme of a package version in the update. Includes the package.json keys, as well as some additional npm metadata
 * @see https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#version
 */
export interface VersionInfo {
  readonly devDependencies: { readonly [name: string]: string };
  readonly dependencies: { readonly [name: string]: string };
  readonly jsii: unknown;
  readonly name: string;
  readonly [key: string]: unknown;
  readonly keywords: string[];
  readonly dist: {
    readonly shasum: string;
    readonly tarball: string;
  };
  readonly version: string;
}

export interface UpdatedVersion {
  /**
   * The `VersionInfo` for the modified package version.
   */
  readonly infos: VersionInfo;

  /**
   * The time at which the `VersionInfo` was last modified.
   */
  readonly modified: Date;

  /**
   * The CouchDB transaction number for the update.
   */
  readonly seq: number;
}
