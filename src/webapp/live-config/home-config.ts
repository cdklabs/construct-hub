import * as s3 from '@aws-cdk/aws-s3';
import { Construct } from '@aws-cdk/core';
import * as triggers from 'cdk-triggers';
import { FileUploader } from './file-uploader';
import { HomeConfigModel } from './model';

const DEFAULT_CONFIG: HomeConfigModel = {
  version: '0.1',
  sections: [
    {
      name: 'From the AWS CDK',
      packages: [
        {
          name: '@aws-cdk/core',
        },
        {
          name: '@aws-cdk/aws-s3',
        },
        {
          name: '@aws-cdk/aws-iam',
        },
        {
          name: '@aws-cdk/aws-lambda',
        },
        {
          name: '@aws-cdk/aws-ec2',
        },
      ],
    },
    {
      name: 'Recently updated',
      showLatest: true,
      showCount: 5,
    },
  ],
};

export interface HomeConfigProps {
  /**
   * The bucket in which the home configuration is stored.
   */
  readonly bucket: s3.Bucket;
  /**
   * The default configuration options to generate if no configuration is found.
   */
  readonly defaultConfig?: HomeConfigModel;
}

export class HomeConfig extends Construct {
  /**
   * The S3 bucket in which live configuration is stored.
   */
  private readonly bucket: s3.Bucket;
  /**
   * The object key in which the home configuration is stored.
   */
  public readonly objectKey = 'config/home.json';

  constructor(scope: Construct, id: string, props: HomeConfigProps) {
    super(scope, id);

    const defaultConfig = props.defaultConfig ?? DEFAULT_CONFIG;
    this.bucket = props.bucket;

    const handler = new FileUploader(this, 'FileUploader', {
      description: 'Uploads a default configuration file if the bucket is empty.',
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        FILE_NAME: this.objectKey,
        FILE_CONTENTS: JSON.stringify(defaultConfig, null, 2),
      },
    });

    this.bucket.grantReadWrite(handler);

    // After the deployment is finished, uploads the default config file only
    // if it doesn't already exist
    new triggers.AfterCreate(this, 'InitHomeConfig', {
      resources: [this.bucket],
      handler,
    });
  }
}