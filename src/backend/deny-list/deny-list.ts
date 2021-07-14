import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Function } from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import { Construct as CoreConstruct } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { DenyListRule, DENY_LIST_BUCKET_NAME_ENV, DENY_LIST_OBJECT_KEY_ENV } from './api';

/**
 * Props for `DenyList`.
 */
export interface DenyListProps {
  /**
   * The deny list.
   * @default []
   */
  readonly rules?: DenyListRule[];
}

/**
 * Manages the construct hub deny list.
 */
export class DenyList extends CoreConstruct {
  private readonly bucket: s3.Bucket;
  private readonly fileName: string;

  constructor(scope: Construct, id: string, props: DenyListProps = {}) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
    });

    this.fileName = 'deny-list.json';
    const directory = this.writeToFile(props.rules ?? [], this.fileName);

    // upload the deny list to the bucket
    new s3deploy.BucketDeployment(this, 'BucketDeployment', {
      destinationBucket: this.bucket,
      sources: [s3deploy.Source.asset(directory)],
    });
  }

  /**
   * Grants an AWS Lambda function permissions to read the deny list.
   */
  public grantRead(handler: Function) {
    handler.addEnvironment(DENY_LIST_BUCKET_NAME_ENV, this.bucket.bucketName);
    handler.addEnvironment(DENY_LIST_OBJECT_KEY_ENV, this.fileName);
    this.bucket.grantRead(handler);
  }

  /**
   * Writes the deny list to a temporary file and returns a path to a directory
   * with the JSON file. The contents of the JSON file is a map where keys are
   * package names (and optionally, version) and the value is the deny list
   * entry. This makes it easier to query by the service.
   *
   * Also performs some validation to make sure there are no duplicate entries.
   *
   * @param list The deny list
   * @returns a path to a temporary directory that can be deployed to S3
   */
  private writeToFile(list: DenyListRule[], fileName: string): string {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'deny-list-'));
    const filePath = path.join(tmpdir, fileName);
    const map: { [nameVersion: string]: DenyListRule } = {};
    for (const entry of list) {
      const key = entry.package + (entry.version ? '@' + entry.package : '');
      if (key in map) {
        throw new Error(`Duplicate deny list entry: ${key}`);
      }

      map[key] = entry;
    }
    fs.writeFileSync(filePath, JSON.stringify(map, null, 2));
    return tmpdir;
  }
}
