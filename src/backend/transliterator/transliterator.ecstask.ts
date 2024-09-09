import * as os from 'os';
import * as path from 'path';
import { Assembly } from '@jsii/spec';
import { Sema } from 'async-sema';
import { metricScope, Unit } from 'aws-embedded-metrics';
import type { PromiseResult } from 'aws-sdk/lib/request';
import * as fs from 'fs-extra';
import * as docgen from 'jsii-docgen';

import { MarkdownRenderer } from 'jsii-docgen/lib/docgen/render/markdown-render';
import { JsiiEntity } from 'jsii-docgen/lib/docgen/schema';
import { MetricName, METRICS_NAMESPACE } from './constants';
import { writeFile } from './util';
import type { S3ObjectVersion, TransliteratorInput } from '../payload-schema';
import * as aws from '../shared/aws.lambda-shared';
import { logInWithCodeArtifact } from '../shared/code-artifact.lambda-shared';
import { compressContent } from '../shared/compress-content.lambda-shared';
import * as constants from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { DocumentationLanguage } from '../shared/language';
import { shellOut } from '../shared/shell-out.lambda-shared';

const ASSEMBLY_KEY_REGEX = new RegExp(
  `^${constants.STORAGE_KEY_PREFIX}((?:@[^/]+/)?[^/]+)/v([^/]+)${constants.ASSEMBLY_KEY_SUFFIX}$`
);

// A semaphore aimed at ensuring we don't open an uncontrolled amount of sockets concurrently, and run out of FDs.
const S3_SEMAPHORE = new Sema(
  parseInt(process.env.MAX_CONCURRENT_S3_REQUESTS ?? '16', 10)
);

/**
 * This function receives an S3 event, and for each record, proceeds to download
 * the `.jsii` assembly the event refers to, transliterates it to the language,
 * configured in `TARGET_LANGUAGE`, and uploads the resulting `.jsii.<lang>`
 * object to S3.
 *
 * @param event   an S3 event payload
 * @param context a Lambda execution context
 *
 * @returns counts of created and deleted entries
 */
export async function handler(
  event: TransliteratorInput
): Promise<{ created_count: number; deleted_count: number }> {
  console.log('Event:', JSON.stringify(event, null, 2));
  const result = await transliterate(event);
  console.log('Transliteration result:', JSON.stringify(result, null, 2));

  // We discard the result in favor of simple counts.
  // The lists of entries are not actually used by the calling step function
  // and are generally too large for the step function execution to handle.
  return {
    created_count: result.created.length,
    deleted_count: result.deleted.length,
  };
}

/**
 * Function that does the actual transliteration.
 * Also used in unit tests that can assert on the returned lists of entries.
 *
 * @param event   an S3 event payload
 * @param context a Lambda execution context
 *
 * @returns a list of all created and deleted entries
 */
export function transliterate(
  event: TransliteratorInput
): Promise<{ created: string[]; deleted: string[] }> {
  // We'll need a writable $HOME directory, or this won't work well, because
  // npm will try to write stuff like the `.npmrc` or package caches in there
  // and that'll bail out on EROFS if that fails.
  return ensureWritableHome(async () => {
    const endpoint = process.env.CODE_ARTIFACT_REPOSITORY_ENDPOINT;
    if (!endpoint) {
      console.log(
        "No CodeArtifact endpoint configured - using npm's default registry"
      );
    } else {
      console.log(`Using CodeArtifact registry: ${endpoint}`);
      const domain = requireEnv('CODE_ARTIFACT_DOMAIN_NAME');
      const domainOwner = process.env.CODE_ARTIFACT_DOMAIN_OWNER;
      const apiEndpoint = process.env.CODE_ARTIFACT_API_ENDPOINT;
      await logInWithCodeArtifact({
        endpoint,
        domain,
        domainOwner,
        apiEndpoint,
      });
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

    const [, packageName, packageVersion] =
      event.assembly.key.match(ASSEMBLY_KEY_REGEX) ?? [];
    if (packageName == null) {
      throw new Error(
        `Invalid object key: "${event.assembly.key}". It was expected to match ${ASSEMBLY_KEY_REGEX}!`
      );
    }

    const packageFqn = `${packageName}@${packageVersion}`;

    console.log(`Source Bucket:  ${event.bucket}`);
    console.log(`Source Key:     ${event.assembly.key}`);
    console.log(`Source Version: ${event.assembly.versionId}`);

    console.log(`Fetching assembly: ${event.assembly.key}`);
    const assemblyResponse = await retry(() =>
      aws
        .s3()
        .getObject({ Bucket: event.bucket, Key: event.assembly.key })
        .promise()
    );
    if (!assemblyResponse.Body) {
      throw new Error(
        `Response body for assembly at key ${event.assembly.key} is empty`
      );
    }

    const assembly = JSON.parse(
      assemblyResponse.Body.toString('utf-8')
    ) as Assembly;
    const submoduleFqns = Object.keys(assembly.submodules ?? {});
    console.log(
      `Assembly ${assembly.name} has ${submoduleFqns.length} submodules.`
    );

    console.log(`Fetching package: ${event.package.key}`);
    const tarballExists = await aws.s3ObjectExists(
      event.bucket,
      event.package.key
    );
    if (!tarballExists) {
      throw new Error(
        `Tarball does not exist at key ${event.package.key} in bucket ${event.bucket}.`
      );
    }
    const readStream = aws
      .s3()
      .getObject({ Bucket: event.bucket, Key: event.package.key })
      .createReadStream();
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'packages-'));
    const tarball = path.join(tmpdir, 'package.tgz');
    await writeFile(tarball, readStream);

    const uploads = new Map<
      string,
      Promise<PromiseResult<AWS.S3.PutObjectOutput, AWS.AWSError>>
    >();
    const deletions = new Map<
      string,
      Promise<PromiseResult<AWS.S3.DeleteObjectOutput, AWS.AWSError>>
    >();

    let unprocessable: boolean = false;

    function markPackage(e: Error, marker: string) {
      const key = event.assembly.key.replace(/\/[^/]+$/, marker);
      const upload = uploadFile(
        event.bucket,
        key,
        event.assembly.versionId,
        Buffer.from(e.message)
      );
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
      const docs = await docgen.Documentation.forPackage(tarball, {
        verbose: true,
      });
      // if the package used to not be installable, remove the marker for it.
      await unmarkPackage(constants.UNINSTALLABLE_PACKAGE_SUFFIX);
      for (const language of DocumentationLanguage.ALL) {
        if (event.languages && !event.languages[language.toString()]) {
          console.log(`Skipping language ${language} as it was not requested!`);
          continue;
        }

        const generateDocs = metricScope(
          (metrics) => async (lang: DocumentationLanguage) => {
            metrics.setDimensions({});
            metrics.setNamespace(METRICS_NAMESPACE);

            async function renderAndDispatch(submoduleFqn?: string) {
              const label = `Rendering documentation in ${lang} for ${packageFqn} (submodule: ${submoduleFqn})`;
              try {
                console.log(label);
                console.time(label);

                const docgenLang = docgen.Language.fromString(lang.name);
                const json = await docs.toJson({
                  readme: true,
                  submodule: submoduleFqn,
                  language: docgenLang,
                });

                const jsonPage = Buffer.from(json.render());
                metrics.putMetric(
                  MetricName.DOCUMENT_SIZE,
                  jsonPage.length,
                  Unit.Bytes
                );
                const {
                  buffer: jsonBody,
                  contentEncoding: jsonContentEncoding,
                } = compressContent(jsonPage);
                metrics.putMetric(
                  MetricName.COMPRESSED_DOCUMENT_SIZE,
                  jsonBody.length,
                  Unit.Bytes
                );

                const jsonKey = formatArtifactKey(
                  event.assembly,
                  lang,
                  submoduleFqn,
                  'json'
                );
                console.log(`Uploading ${jsonKey}`);
                const jsonUpload = uploadFile(
                  event.bucket,
                  jsonKey,
                  event.assembly.versionId,
                  jsonBody,
                  jsonContentEncoding
                );
                uploads.set(jsonKey, jsonUpload);

                const markdown = MarkdownRenderer.fromSchema(json.content, {
                  anchorFormatter,
                  linkFormatter: linkFormatter(docgenLang),
                });

                const page = Buffer.from(markdown.render());
                metrics.putMetric(
                  MetricName.DOCUMENT_SIZE,
                  page.length,
                  Unit.Bytes
                );
                const { buffer: body, contentEncoding } = compressContent(page);
                metrics.putMetric(
                  MetricName.COMPRESSED_DOCUMENT_SIZE,
                  body.length,
                  Unit.Bytes
                );

                const key = formatArtifactKey(
                  event.assembly,
                  lang,
                  submoduleFqn,
                  'md'
                );
                console.log(`Uploading ${key}`);
                const upload = uploadFile(
                  event.bucket,
                  key,
                  event.assembly.versionId,
                  body,
                  contentEncoding
                );
                uploads.set(key, upload);

                // if the package used to have a corrupt assembly, remove the marker for it.
                await unmarkPackage(
                  constants.corruptAssemblyKeySuffix(
                    language,
                    submoduleFqn,
                    'md'
                  )
                );
              } catch (e) {
                console.error(e);
                if (e instanceof docgen.LanguageNotSupportedError) {
                  markPackage(
                    e,
                    constants.notSupportedKeySuffix(
                      language,
                      submoduleFqn,
                      'json'
                    )
                  );
                  markPackage(
                    e,
                    constants.notSupportedKeySuffix(
                      language,
                      submoduleFqn,
                      'md'
                    )
                  );
                } else if (e instanceof docgen.CorruptedAssemblyError) {
                  markPackage(
                    e,
                    constants.corruptAssemblyKeySuffix(
                      language,
                      submoduleFqn,
                      'json'
                    )
                  );
                  markPackage(
                    e,
                    constants.corruptAssemblyKeySuffix(
                      language,
                      submoduleFqn,
                      'md'
                    )
                  );
                  unprocessable = true;
                } else {
                  throw e;
                }
              } finally {
                console.timeEnd(label);
              }
            }
            await renderAndDispatch();
            for (const submoduleFqn of submoduleFqns) {
              await renderAndDispatch(submoduleFqn);
            }
          }
        );
        try {
          const label = `Generating documentation for ${packageFqn} in ${language}`;
          console.time(label);
          await generateDocs(language);
          console.timeEnd(label);
        } catch (error) {
          // transliteration failure will stop the whole language, not just a submodule
          if (error instanceof docgen.TransliterationError) {
            markPackage(
              error,
              constants.transliterationErrorKeySuffix(language)
            );
            unprocessable = true;
          } else {
            throw error;
          }
        }
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
      created.push({
        bucket: event.bucket,
        key,
        versionId: response.VersionId,
      });
      console.log(
        `Finished uploading ${key} (Version ID: ${response.VersionId})`
      );
    }

    for (const [key, deletion] of deletions.entries()) {
      const response = await deletion;
      deleted.push({
        bucket: event.bucket,
        key,
        versionId: response.VersionId,
      });
      console.log(
        `Finished deleting ${key} (Version ID: ${response.VersionId})`
      );
    }

    if (unprocessable) {
      // the message here doesn't matter, we only use the error name
      // to divert this message away from the DLQ.
      const error = new Error();
      error.name = constants.UNPROCESSABLE_PACKAGE_ERROR_NAME;
    }

    // make entries more readable
    const s3OKey = (s3Obj: S3Object) => s3Obj.key;
    return { created: created.map(s3OKey), deleted: deleted.map(s3OKey) };
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

async function uploadFile(
  bucket: string,
  key: string,
  sourceVersionId?: string,
  body?: AWS.S3.Body,
  contentEncoding?: 'gzip'
) {
  const contentType = key.endsWith('.md')
    ? 'text/markdown; charset=UTF-8'
    : key.endsWith('.json')
    ? 'application/json; charset=UTF-8'
    : 'application/octet-stream';

  await S3_SEMAPHORE.acquire();
  try {
    console.log(S3_SEMAPHORE.nrWaiting() + ' S3 calls are waiting');
    return await retry(() =>
      aws
        .s3()
        .putObject({
          Bucket: bucket,
          Key: key,
          Body: body,
          // We may not import anything that uses 'aws-cdk-lib' here
          CacheControl:
            'public, max-age=300, must-revalidate, s-maxage=60, proxy-revalidate',
          ContentEncoding: contentEncoding,
          ContentType: contentType,
          Metadata: {
            'Origin-Version-Id': sourceVersionId ?? 'N/A',
          },
        })
        .promise()
    );
  } finally {
    S3_SEMAPHORE.release();
  }
}

async function deleteFile(bucket: string, key: string) {
  await S3_SEMAPHORE.acquire();
  try {
    console.log(S3_SEMAPHORE.nrWaiting() + ' S3 calls are waiting');
    return await retry(() =>
      aws
        .s3()
        .deleteObject({
          Bucket: bucket,
          Key: key,
        })
        .promise()
    );
  } finally {
    S3_SEMAPHORE.release();
  }
}

function anchorFormatter(type: JsiiEntity) {
  const name = getAssemblyRelativeName(type); // BucketProps.Initializer.parameter.accessControl
  const [base, ...rest] = name.split('.');
  if (rest.length > 0) {
    return sanitize(rest.join('.')); // Initializer.parameter.accessControl
  } else {
    return sanitize(base);
  }
}

function formatArtifactKey(
  assemblyObject: S3ObjectVersion,
  lang: DocumentationLanguage,
  submoduleFqn: string | undefined,
  extension: string
) {
  return assemblyObject.key.replace(
    /\/[^/]+$/,
    constants.docsKeySuffix(lang, submoduleFqn, extension)
  );
}

function linkFormatter(lang: docgen.Language) {
  const formatter = (type: JsiiEntity) => {
    const name = getAssemblyRelativeName(type); // BucketProps.Initializer.parameter.accessControl
    const [baseName, ...rest] = name.split('.');
    const hash = '#' + rest.join('.'); // #Initializer.parameter.accessControl
    const langParam = `?lang=${lang.toString()}`;
    const submoduleParam = type.submodule ? `&submodule=${type.submodule}` : '';
    return `<a href="/packages/${type.packageName}/v/${type.packageVersion}/api/${baseName}${langParam}${submoduleParam}${hash}">${type.displayName}</a>`;
  };
  return formatter;
}

/**
 * Converts a type's id to an assembly-relative version, e.g.:
 * `aws-cdk-lib.aws_s3.Bucket.parameter.accessControl` => `Bucket.parameter.accessControl`
 */
function getAssemblyRelativeName(type: JsiiEntity): string {
  let name = type.id;
  if (!name.startsWith(type.packageName)) {
    throw new Error(
      `Expected first part of "${type.id}" to start with "${type.packageName}".`
    );
  }
  name = name.slice(type.packageName.length + 1); // remove "aws-cdk-lib.""
  if (type.submodule) {
    if (!name.startsWith(type.submodule)) {
      throw new Error(
        `Expected second part of "${type.id}" to start with "${type.submodule}".`
      );
    }
    name = name.slice(type.submodule.length + 1); // remove "aws_s3."
  }
  return name;
}

function sanitize(str: string) {
  // HTML5 allows any characters in IDs except whitespace
  return str.replace(/ /g, '-');
}

interface S3Object {
  readonly bucket: string;
  readonly key: string;
  readonly versionId?: string;
}

/**
 * Retry a function a number of times if it happens to get throttled
 */
async function retry<A>(cb: () => Promise<A>): Promise<A> {
  const deadline = Date.now() + 60_000; // one minute
  let sleepMs = 20;
  while (true) {
    try {
      return await cb();
    } catch (e) {
      if (!isRetryableError(e)) {
        console.log(`Error is not retryable`);
        throw e;
      }

      if (Date.now() >= deadline) {
        console.log(`Retry wait time reached limit: ${sleepMs}`);
        throw e;
      }

      await sleep(Math.floor(Math.random() * sleepMs));
      sleepMs *= 2;
    }
  }
}

function isRetryableError(e: any) {
  // Prepare for AWS SDK v3 already
  return (
    e.code === 'SlowDown' ||
    e.name === 'SlowDown' ||
    e.code === 503 ||
    e.statusCode === 503 ||
    e.retryable === true
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((ok) => setTimeout(ok, ms));
}
