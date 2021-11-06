/**
 * Input payload for the Ingestion function. This is the format of the message
 * the discovery function should use when signalling the intake queue.
 */
export interface IngestionInput {
  /**
   * The integrity checksum of this message.
   */
  readonly integrity: string;

  /**
   * Any metadata associated with the package by the discovery function.
   */
  readonly metadata: { readonly [key: string]: string };

  /**
   * The URI to an npm package tarball.
   */
  readonly tarballUri: string;

  /**
   * The time at which the version was published, encoded in ISO-8601 format.
   */
  readonly time: string;

  /**
   * Skip generating docs.
   *
   * @default false
   */
  readonly skipDocgen?: boolean;
}
