export interface StateMachineInput {
  readonly bucket: string;
  readonly assembly: S3ObjectVersion;
  readonly package: S3ObjectVersion;
  readonly metadata: S3ObjectVersion;
}

export type CatalogBuilderInput = Pick<StateMachineInput, 'package'>;

export type TransliteratorInput = Pick<StateMachineInput, 'bucket' | 'assembly'>;

export interface S3ObjectVersion {
  readonly key: string;
  readonly versionId?: string;
}
