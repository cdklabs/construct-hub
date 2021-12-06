import * as os from 'os';
import * as path from 'path';
import { metricScope, Unit } from 'aws-embedded-metrics';
import type { PromiseResult } from 'aws-sdk/lib/request';
import * as fs from 'fs-extra';
import * as docgen from 'jsii-docgen';

import type { TransliteratorInput } from '../payload-schema';
import * as aws from '../shared/aws.lambda-shared';
import { logInWithCodeArtifact } from '../shared/code-artifact.lambda-shared';
import { compressContent } from '../shared/compress-content.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { DocumentationLanguage } from '../shared/language';
import { shellOut } from '../shared/shell-out.lambda-shared';
import { MetricName, METRICS_NAMESPACE } from './constants';
import { writeFile } from './util';

const ASSEMBLY_KEY_REGEX = new RegExp(`^${constants.STORAGE_KEY_PREFIX}((?:@[^/]+/)?[^/]+)/v([^/]+)${constants.ASSEMBLY_KEY_SUFFIX}$`);
// Capture groups:                                                     ┗━━━━━━━━━1━━━━━━━┛  ┗━━2━━┛

/**
 * This function receives an S3 event, and for each record, proceeds to download
 * the `.jsii` assembly the event refers to, transliterates it to the language,
 * configured in `TARGET_LANGUAGE`, and uploads the resulting `.jsii.<lang>`
 * object to S3.
 *
 * @param event   an S3 event payload
 * @param context a Lambda execution context
 *
 * @returns nothing
 */
export function handler(event: TransliteratorInput): Promise<{ created: S3Object[]; deleted: S3Object[] }> {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
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

    // Set up NPM shared cache directory (https://docs.npmjs.com/cli/v7/using-npm/config#cache)
    const npmCacheDir = process.env.NPM_CACHE;
    if (npmCacheDir) {
      // Create it if it does not exist yet...
      await fs.mkdirp(npmCacheDir);
      console.log(`Using shared NPM cache at: ${npmCacheDir}`);
      await shellOut('npm', 'config', 'set', `cache=${npmCacheDir}`);
    }

    const created = new Array<S3Object>();
    const deleted = new Array<S3Object>();

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

    console.log(`Fetching package: ${event.package.key}`);
    const tarballExists = await aws.s3ObjectExists(event.bucket, event.package.key);
    if (!tarballExists) {
      throw new Error(`Tarball does not exist at key ${event.package.key} in bucket ${event.bucket}.`);
    }
    const readStream = aws.s3().getObject({ Bucket: event.bucket, Key: event.package.key }).createReadStream();
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'packages-'));
    const tarball = path.join(tmpdir, 'package.tgz');
    await writeFile(tarball, readStream);

    const uploads = new Map<string, Promise<PromiseResult<AWS.S3.PutObjectOutput, AWS.AWSError>>>();
    const deletions = new Map<string, Promise<PromiseResult<AWS.S3.DeleteObjectOutput, AWS.AWSError>>>();

    let unprocessable: boolean = false;

    function markPackage(e: Error, marker: string) {
      const key = event.assembly.key.replace(/\/[^/]+$/, marker);
      const upload = uploadFile(event.bucket, key, event.assembly.versionId, Buffer.from(e.message));
      uploads.set(key, upload);
    }

    async function unmarkPackage(marker: string) {
      const key = event.assembly.key.replace(/\/[^/]+$/, marker);
      const marked = await aws.s3ObjectExists(event.bucket, key);
      if (!marked) {
        return;
      }
      const deletion = deleteFile(event.bucket, key);
      deletions.set(key, deletion);
    }

    console.log(`Generating documentation for ${packageFqn}...`);
    try {
      const docs = await docgen.Documentation.forPackage(tarball, { name: assembly.name });
      // if the package used to not be installabe, remove the marker for it.
      await unmarkPackage(constants.UNINSTALLABLE_PACKAGE_SUFFIX);
      for (const language of DocumentationLanguage.ALL) {
        if (event.languages && !event.languages[language.toString()]) {
          console.log(`Skipping language ${language} as it was not requested!`);
          continue;
        }

        const generateDocs = metricScope((metrics) => async (lang: DocumentationLanguage) => {
          metrics.setDimensions();
          metrics.setNamespace(METRICS_NAMESPACE);

          async function renderAndDispatch(submodule?: string) {

            try {

              console.log(`Rendering documentation in ${lang} for ${packageFqn} (submodule: ${submodule})`);
              const markdown = await docs.render({
                submodule,
                linkFormatter: linkFormatter,
                language: docgen.Language.fromString(lang.name),
              });
              // if the package used to have a corrupt assembly, remove the marker for it.
              await unmarkPackage(constants.corruptAssemblyKeySuffix(language, submodule));
              const page = Buffer.from(markdown.render());
              metrics.putMetric(MetricName.DOCUMENT_SIZE, page.length, Unit.Bytes);
              const { buffer: body, contentEncoding } = compressContent(page);
              metrics.putMetric(MetricName.COMPRESSED_DOCUMENT_SIZE, body.length, Unit.Bytes);

              const key = event.assembly.key.replace(/\/[^/]+$/, constants.docsKeySuffix(lang, submodule));
              console.log(`Uploading ${key}`);
              const upload = uploadFile(event.bucket, key, event.assembly.versionId, body, contentEncoding);
              uploads.set(key, upload);

            } catch (e) {
              if (e instanceof docgen.LanguageNotSupportedError) {
                markPackage(e, constants.notSupportedKeySuffix(language, submodule));
              } else if (e instanceof docgen.CorruptedAssemblyError) {
                markPackage(e, constants.corruptAssemblyKeySuffix(language, submodule));
                unprocessable = true;
              } else {
                throw e;
              }
            }
          }
          await renderAndDispatch();
          for (const submodule of submodules) {
            await renderAndDispatch(submodule);
          }
        });
        await generateDocs(language);
      }
    } catch (error) {
      if (error instanceof docgen.UnInstallablePackageError) {
        markPackage(error, constants.UNINSTALLABLE_PACKAGE_SUFFIX);
        unprocessable = true;
      } else {
        throw error;
      }
    }

    for (const [key, upload] of uploads.entries()) {
      const response = await upload;
      created.push({ bucket: event.bucket, key, versionId: response.VersionId });
      console.log(`Finished uploading ${key} (Version ID: ${response.VersionId})`);
    }

    for (const [key, deletion] of deletions.entries()) {
      const response = await deletion;
      deleted.push({ bucket: event.bucket, key, versionId: response.VersionId });
      console.log(`Finished deleting ${key} (Version ID: ${response.VersionId})`);
    }

    if (unprocessable) {
      // the message here doesn't matter, we only use the error name
      // to divert this message away from the DLQ.
      const error = new Error();
      error.name = constants.UNPROCESSABLE_PACKAGE_ERROR_NAME;
    }

    return { created, deleted };
  });
}

async function ensureWritableHome<T>(cb: () => Promise<T>): Promise<T> {
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

function uploadFile(bucket: string, key: string, sourceVersionId?: string, body?: AWS.S3.Body, contentEncoding?: 'gzip') {
  return aws.s3().putObject({
    Bucket: bucket,
    Key: key,
    Body: body,
    CacheControl: 'public, max-age=300, must-revalidate, proxy-revalidate', // Expire from cache after 10 minutes
    ContentEncoding: contentEncoding,
    ContentType: 'text/markdown; charset=UTF-8',
    Metadata: {
      'Origin-Version-Id': sourceVersionId ?? 'N/A',
    },
  }).promise();
}

function deleteFile(bucket: string, key: string) {
  return aws.s3().deleteObject({
    Bucket: bucket,
    Key: key,
  }).promise();
}

/**
 * A link formatter to make sure type links redirect to the appropriate package
 * page in the webapp.
 */
function linkFormatter(type: docgen.TranspiledType): string {

  const packageName = type.source.assembly.name;
  const packageVersion = type.source.assembly.version;

  // the webapp sanitizes anchors - so we need to as well when
  // linking to them.
  const hash = sanitize(type.fqn);
  const query = `?lang=${type.language.toString()}${type.submodule ? `&submodule=${type.submodule}` : ''}`;
  return `/packages/${packageName}/v/${packageVersion}/api/${hash}${query}`;

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
