import * as os from 'os';
import * as path from 'path';
// eslint-disable-next-line import/no-unresolved
import type { Context, S3Event, SNSEvent } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import { PromiseResult } from 'aws-sdk/lib/request';
import * as fs from 'fs-extra';
import * as docgen from 'jsii-docgen';

import { logInWithCodeArtifact } from '../shared/code-artifact.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { DocumentationLanguage } from '../shared/language';

const clients = new Map<string, S3>();

const ASSEMBLY_KEY_REGEX = new RegExp(`^${constants.STORAGE_KEY_PREFIX}((?:@[^/]+/)?[^/]+)/v([^/]+)${constants.ASSEMBLY_KEY_SUFFIX}$`);
// Capture groups:                                                    ┗━━━━━━━━━1━━━━━━━┛  ┗━━2━━┛

/**
 * This function receives an S3 event, and for each record, proceeds to download
 * the `.jsii` assembly the event refers to, transliterates it to Python, then
 * uploads the resulting `.jsii.python` object to S3.
 *
 * @param event   an S3 event payload
 * @param context a Lambda execution context
 *
 * @returns nothing
 */
export function handler(event: SNSEvent, context: Context): Promise<readonly S3Object[]> {
  console.log(JSON.stringify(event, null, 2));
  // We'll need a writable $HOME directory, or this won't work well, because
  // npm will try to write stuff like the `.npmrc` or package caches in there
  // and that'll bail out on EROFS if that fails.
  return withFakeHome(async () => {
    const endpoint = process.env.CODE_ARTIFACT_REPOSITORY_ENDPOINT;
    if (!endpoint) {
      console.log('No CodeArtifact endpoint configured - using npm\'s default registry');
    } else {
      console.log(`Using CodeArtifact registry: ${endpoint}`);
      const domain = requireEnv('CODE_ARTIFACT_DOMAIN_NAME');
      const domainOwner = process.env.CODE_ARTIFACT_DOMAIN_OWNER;
      const apiEndpoint = process.env.CODE_ARTIFACT_API_ENDPOINT;
      await logInWithCodeArtifact({ endpoint, domain, domainOwner, apiEndpoint });
    }

    const language = requireEnv('LANGUAGE');

    const created = new Array<S3Object>();
    for (const snsRecord of event.Records) {

      const s3Event: S3Event = JSON.parse(snsRecord.Sns.Message);

      for (const record of s3Event.Records) {

        // Key names are escaped (`@` as `%40`) in the input payload... Decode it here... We cannot use
        // `decodeURI` here because it does not undo encoding that `encodeURI` would not have done, and
        // that would not replace `@` in the position where it is in the keys... So we have to work on
        // the URI components instead.
        const inputKey = record.s3.object.key.split('/').map((comp) => decodeURIComponent(comp)).join('/');
        const [, packageName, packageVersion] = inputKey.match(ASSEMBLY_KEY_REGEX) ?? [];
        if (packageName == null) {
          throw new Error(`Invalid object key: "${inputKey}". It was expected to match ${ASSEMBLY_KEY_REGEX}!`);
        }

        const packageFqn = `${packageName}@${packageVersion}`;

        const client = (clients.has(record.awsRegion)
          ? clients
          : clients.set(record.awsRegion, new S3({ region: record.awsRegion }))
        ).get(record.awsRegion)!;

        console.log(`Source Bucket:  ${record.s3.bucket.name}`);
        console.log(`Source Key:     ${inputKey}`);
        console.log(`Source Version: ${record.s3.object.versionId}`);

        console.log(`Fetching assembly: ${inputKey}`);
        const assemblyResponse = await client.getObject({ Bucket: record.s3.bucket.name, Key: inputKey }).promise();
        if (!assemblyResponse.Body) {
          throw new Error(`Response body for assembly at key ${inputKey} is empty`);
        }

        const assembly = JSON.parse(assemblyResponse.Body.toString('utf-8'));
        const submodules = Object.keys(assembly.submodules ?? {}).map(s => s.split('.')[1]);

        async function generateDocs(lang: string) {

          const uploads = new Map<string, Promise<PromiseResult<AWS.S3.PutObjectOutput, AWS.AWSError>>>();
          const docs = await docgen.Documentation.forPackage(packageFqn, { language: docgen.Language.fromString(lang) });

          function renderAndDispatch(submodule?: string) {
            console.log(`Rendering documentation in ${lang} for ${packageFqn} (submodule: ${submodule})`);
            const page = docs.render({ submodule, linkFormatter: linkFormatter(docs) }).render();
            const key = inputKey.replace(/\/[^/]+$/, constants.docsKeySuffix(DocumentationLanguage.fromString(lang), submodule));
            console.log(`Uploading ${key}`);
            const upload = client.putObject({
              Bucket: record.s3.bucket.name,
              Key: key,
              Body: page,
              ContentType: 'text/html',
              Metadata: {
                'Origin-Version-Id': record.s3.object.versionId ?? 'N/A',
                'Lambda-Log-Group': context.logGroupName,
                'Lambda-Log-Stream': context.logStreamName,
                'Lambda-Run-Id': context.awsRequestId,
              },
            }).promise();
            uploads.set(key, upload);
          }

          renderAndDispatch();
          for (const submodule of submodules) {
            renderAndDispatch(submodule);
          }

          for (const [key, upload] of uploads.entries()) {
            const response = await upload;
            created.push({ bucket: record.s3.bucket.name, key: key, versionId: response.VersionId });
            console.log(`Finished uploading ${key} (Version ID: ${response.VersionId})`);
          }

        }
        await generateDocs(language);
      }

    }
    return created;
  });
}

async function withFakeHome<T>(cb: () => Promise<T>): Promise<T> {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'fake-home'));
  const oldHome = process.env.HOME;
  try {
    process.env.HOME = fakeHome;
    return await cb();
  } finally {
    process.env.HOME = oldHome;
    await fs.remove(fakeHome);
  }
}

/**
 * A link formatter to make sure type links redirect to the appropriate package
 * page in the webapp.
 */
function linkFormatter(docs: docgen.Documentation): (type: docgen.TranspiledType) => string {

  function _formatter(type: docgen.TranspiledType): string {

    const packageName = type.source.assembly.name;
    const packageVersion = type.source.assembly.version;

    // the webapp sanitizes anchors - so we need to as well when
    // linking to them.
    const hash = sanitize(type.fqn);

    if (docs.assembly.name === packageName) {
      // link to the same package - just add the hash
      return `#${hash}`;
    }

    // cross link to another package
    return `/packages/${packageName}/v/${packageVersion}?lang=${type.language.toString()}${type.submodule ? `&submodule=${type.submodule}` : ''}#${hash}`;
  }

  return _formatter;
}

function sanitize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/ /g, '-');
};


/**
 * Visible for testing. Clears the caches so that the next execution runs clean.
 */
export function reset() {
  clients.clear();
}

interface S3Object {
  readonly bucket: string;
  readonly key: string;
  readonly versionId?: string;
}
