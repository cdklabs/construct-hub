export interface StateMachineInput {
  readonly bucket: string;
  readonly assembly: S3ObjectVersion;
  readonly package: S3ObjectVersion;
  readonly metadata: S3ObjectVersion;

  /**
   * If provided, limits which languages will actually be rendered.
   *
   * @default - all languages are rendered.
   */
  readonly languages?: {
    /**
     * Whether the named language will be rendered or not.
     *
     * @default false
     */
    readonly [name: string]: boolean | undefined;
  };
}

export type CatalogBuilderInput = Pick<StateMachineInput, 'package'> & { readonly startAfter?: string };

export type TransliteratorInput = Pick<StateMachineInput, 'bucket' | 'assembly' | 'package'>;

export interface S3ObjectVersion {
  readonly key: string;
  readonly versionId?: string;
}
