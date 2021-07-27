import { Context } from 'aws-lambda';

import { StateMachineInput } from '../payload-schema';
import * as aws from '../shared/aws.lambda-shared';
import { ASSEMBLY_KEY_SUFFIX, METADATA_KEY_SUFFIX, PACKAGE_KEY_SUFFIX, STORAGE_KEY_PREFIX } from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';

export async function handler(event: unknown, _context: Context): Promise<void> {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  const bucketName = requireEnv('BUCKET_NAME');
  const stateMachineArn = requireEnv('STATE_MACHINE_ARN');

  for await (const input of listIndexedPackages(bucketName)) {
    console.log(`Input payload: ${JSON.stringify(input, null, 2)}`);
    const { executionArn } = await aws.stepFunctions().startExecution({
      input: JSON.stringify(input),
      stateMachineArn,
    }).promise();
    console.log(`Started execution: ${executionArn}`);
  }
}

const scopedPrefix = `${STORAGE_KEY_PREFIX}@`;
async function* listIndexedPackages(bucketName: string): AsyncGenerator<StateMachineInput> {
  const request: AWS.S3.ListObjectsV2Request = {
    Bucket: bucketName,
    Delimiter: '/',
    Prefix: STORAGE_KEY_PREFIX,
  };
  do {
    const response = await aws.s3().listObjectsV2(request).promise();
    request.ContinuationToken = response.NextContinuationToken;

    for (const { Prefix: prefix } of response.CommonPrefixes ?? []) {
      if (prefix?.startsWith(scopedPrefix)) {
        yield* listScopedPackages(bucketName, prefix);
      } else if (prefix?.endsWith('/')) {
        yield* listPackageVersions(bucketName, prefix);
      }
    }
  } while (request.ContinuationToken != null);
}

async function* listScopedPackages(bucketName: string, prefix: string) {
  const request: AWS.S3.ListObjectsV2Request = {
    Bucket: bucketName,
    Delimiter: '/',
    Prefix: prefix,
  };
  do {
    const response = await aws.s3().listObjectsV2(request).promise();
    request.ContinuationToken = response.NextContinuationToken;

    for (const { Prefix: packagePrefix } of response.CommonPrefixes ?? []) {
      if (packagePrefix?.endsWith('/')) {
        yield* listPackageVersions(bucketName, packagePrefix);
      }
    }
  } while (request.ContinuationToken != null);
}

async function* listPackageVersions(bucketName: string, prefix: string) {
  const request: AWS.S3.ListObjectsV2Request = {
    Bucket: bucketName,
    Delimiter: '/',
    Prefix: prefix,
  };
  do {
    const response = await aws.s3().listObjectsV2(request).promise();
    request.ContinuationToken = response.NextContinuationToken;

    for (let { Prefix: packageVersion } of response.CommonPrefixes ?? []) {
      if (packageVersion?.endsWith('/')) {
        // Strip the trailing / so it's not duplicated in the output key.
        packageVersion = packageVersion.substring(0, packageVersion.length - 1);

        const assemblyKey = `${packageVersion}${ASSEMBLY_KEY_SUFFIX}`;
        const metadataKey = `${packageVersion}${METADATA_KEY_SUFFIX}`;
        const packageKey = `${packageVersion}${PACKAGE_KEY_SUFFIX}`;

        const foundResult = await Promise.all([
          await aws.s3ObjectExists(bucketName, assemblyKey),
          await aws.s3ObjectExists(bucketName, metadataKey),
          await aws.s3ObjectExists(bucketName, packageKey),
        ]);
        const allFound = foundResult.every((found) => found);

        if (allFound) {
          const sfnInput: StateMachineInput = {
            bucket: bucketName,
            assembly: { key: assemblyKey },
            metadata: { key: metadataKey },
            package: { key: packageKey },
          };
          yield sfnInput;
        }
      }
    }
  } while (request.ContinuationToken != null);
}
