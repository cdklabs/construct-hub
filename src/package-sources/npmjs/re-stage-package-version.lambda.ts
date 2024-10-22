import { InvokeCommand } from '@aws-sdk/client-lambda';
import { VersionInfo } from './npm-js-follower.lambda';
import { PackageVersion } from './stage-and-notify.lambda';
import { LAMBDA_CLIENT } from '../../backend/shared/aws.lambda-shared';
import { requireEnv } from '../../backend/shared/env.lambda-shared';

/**
 * This function is invoked manually with a `IngestPackageVersion` object.
 * It allows the manual reprocessing of a package version that failed to ingest.
 *
 * The payload is used to query information about the package version from npmjs.
 * It will then call the staging function with the required details, which than takes care of all the usual processing.
 */
export async function handler(event: IngestPackageVersion): Promise<void> {
  console.log('Event', JSON.stringify(event, null, 2));
  const stagingFunction = requireEnv('FUNCTION_NAME');
  const registryUrl = requireEnv('REGISTRY_URL');

  const res = await fetch(`${registryUrl}/${event.name}/${event.version}`);

  const modified = new Date(res.headers.get('Last-Modified') ?? Date.now());
  const infos: VersionInfo = (await res.json()) as any;
  console.log('Package', JSON.stringify(infos, null, 2));

  const invokeArgs: PackageVersion = {
    integrity: infos.dist.shasum,
    modified: modified.toISOString(),
    name: infos.name,
    tarballUrl: infos.dist.tarball,
    version: infos.version,
  };

  // "Fire-and-forget" invocation here.
  console.log(`Sending ${invokeArgs.tarballUrl} for staging`);
  await LAMBDA_CLIENT.send(
    new InvokeCommand({
      FunctionName: stagingFunction,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(invokeArgs)),
    })
  );
}

interface IngestPackageVersion {
  readonly name: string;
  readonly version: string;
}
