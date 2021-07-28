import * as os from 'os';
import * as path from 'path';

import type { Context } from 'aws-lambda';
import { PromiseResult } from 'aws-sdk/lib/request';
import * as fs from 'fs-extra';
import * as docgen from 'jsii-docgen';

import type { TransliteratorInput } from '../payload-schema';
import * as aws from '../shared/aws.lambda-shared';
import { logInWithCodeArtifact } from '../shared/code-artifact.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { DocumentationLanguage } from '../shared/language';

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
export function handler(event: TransliteratorInput, context: Context): Promise<S3Object[]> {
  console.log(JSON.stringify(event, null, 2));
  // We'll need a writable $HOME directory, or this won't work well, because
  // npm will try to write stuff like the `.npmrc` or package caches in there
  // and that'll bail out on EROFS if that fails.
  return ensureWritableHome(async () => {
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

    const language = requireEnv('TARGET_LANGUAGE');
    const created = new Array<S3Object>();

    const [, packageName, packageVersion] = event.assembly.key.match(ASSEMBLY_KEY_REGEX) ?? [];
    if (packageName == null) {
      throw new Error(`Invalid object key: "${event.assembly.key}". It was expected to match ${ASSEMBLY_KEY_REGEX}!`);
    }

    const packageFqn = `${packageName}@${packageVersion}`;

    console.log(`Source Bucket:  ${event.bucket}`);
    console.log(`Source Key:     ${event.assembly.key}`);
    console.log(`Source Version: ${event.assembly.versionId}`);

    console.log(`Fetching assembly: ${event.assembly.key}`);
    const assemblyResponse = await aws.s3().getObject({ Bucket: event.bucket, Key: event.assembly.key }).promise();
    if (!assemblyResponse.Body) {
      throw new Error(`Response body for assembly at key ${event.assembly.key} is empty`);
    }

    const assembly = JSON.parse(assemblyResponse.Body.toString('utf-8'));
    const submodules = Object.keys(assembly.submodules ?? {}).map(s => s.split('.')[1]);

    if (language !== 'typescript' && assembly.targets[language] == null) {
      console.error(`Package ${assembly.name}@${assembly.version} does not support ${language}, skipping!`);
      console.log(`Assembly targets: ${JSON.stringify(assembly.targets, null, 2)}`);
      for (const submodule of [undefined, ...submodules]) {
        const key = event.assembly.key.replace(/\/[^/]+$/, constants.docsKeySuffix(DocumentationLanguage.fromString(language), submodule)) + constants.NOT_SUPPORTED_SUFFIX;
        const response = await uploadFile(context, event.bucket, key, event.assembly.versionId);
        created.push({ bucket: event.bucket, key, versionId: response.VersionId });
      }
      return created;
    }

    async function generateDocs(lang: string) {

      const uploads = new Map<string, Promise<PromiseResult<AWS.S3.PutObjectOutput, AWS.AWSError>>>();
      const docs = await docgen.Documentation.forPackage(packageFqn, { language: docgen.Language.fromString(lang) });

      function renderAndDispatch(submodule?: string) {
        console.log(`Rendering documentation in ${lang} for ${packageFqn} (submodule: ${submodule})`);
        const page = docs.render({ submodule, linkFormatter: linkFormatter(docs) }).render();
        const key = event.assembly.key.replace(/\/[^/]+$/, constants.docsKeySuffix(DocumentationLanguage.fromString(lang), submodule));
        console.log(`Uploading ${key}`);
        const upload = uploadFile(context, event.bucket, key, event.assembly.versionId, page);
        uploads.set(key, upload);
      }

      renderAndDispatch();
      for (const submodule of submodules) {
        renderAndDispatch(submodule);
      }

      for (const [key, upload] of uploads.entries()) {
        const response = await upload;
        created.push({ bucket: event.bucket, key, versionId: response.VersionId });
        console.log(`Finished uploading ${key} (Version ID: ${response.VersionId})`);
      }

    }
    await generateDocs(language);

    return created;
  });
}

async function ensureWritableHome<T>(cb: () => Promise<T>): Promise<T> {
  if (process.env.HOME) {
    // $HOME is set, so let's check if it is writable
    const stat = await fs.stat(process.env.HOME);
    // We check against the rwx------ bitmask here, as group & other are
    // probably not relevant to our business. This is a good enough heuristic
    // within lambda functions.
    // eslint-disable-next-line no-bitwise
    if (stat.isDirectory() && (stat.mode & 0o700) === 0o700) {
      console.log(`Using existing, writable $HOME directory: ${process.env.HOME}`);
      return cb();
    }
  }

  // Since $HOME is not set, or is not writable, we'll just go make our own...
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'fake-home'));
  console.log(`Made temporary $HOME directory: ${fakeHome}`);
  const oldHome = process.env.HOME;
  try {
    process.env.HOME = fakeHome;
    return await cb();
  } finally {
    process.env.HOME = oldHome;
    await fs.remove(fakeHome);
    console.log(`Cleaned-up temporary $HOME directory: ${fakeHome}`);
  }
}

function uploadFile(context: Context, bucket: string, key: string, sourceVersionId?: string, body?: AWS.S3.Body) {
  return aws.s3().putObject({
    Bucket: bucket,
    Key: key,
    Body: body,
    CacheControl: 'public',
    ContentType: 'text/markdown; charset=UTF-8',
    Metadata: {
      'Origin-Version-Id': sourceVersionId ?? 'N/A',
      'Lambda-Log-Group': context.logGroupName,
      'Lambda-Log-Stream': context.logStreamName,
      'Lambda-Run-Id': context.awsRequestId,
    },
  }).promise();
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

interface S3Object {
  readonly bucket: string;
  readonly key: string;
  readonly versionId?: string;
}
