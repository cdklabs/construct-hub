import { metricScope, Unit } from 'aws-embedded-metrics';
import type { Context } from 'aws-lambda';
import * as aws from 'aws-sdk';
import * as constants from './constants';
import { generateReleaseNotes } from './shared/github-changelog-fetcher.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';
import { extractObjects } from '../shared/tarball.lambda-shared';

export type ReleaseNotesGenerateEvent = { tarballUri: string };

/**
 * * @param event: ReleaseNotesGenerateEvent
 *
 * Lambda function to generate release notes from Github
 * The lambda tries to get generate release notes from
 * 1. Github release for the given version number
 * 2. Github releases page (in case the version number is not exact match)
 * 3. changelog.md or similar changelog files
 * The repository information is determined by reading the package.json file
 * for the given package
 */
export const handler = metricScope(
  (metrics) => async (event: ReleaseNotesGenerateEvent, context: Context) => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    metrics.setDimensions();
    metrics.setNamespace(constants.METRICS_NAMESPACE);

    const BUCKET_NAME = requireEnv('BUCKET_NAME');

    const tarballUri = new URL(event.tarballUri);
    if (tarballUri.protocol !== 's3:') {
      metrics.putMetric(constants.AllErrors, 1, Unit.Count);
      metrics.putMetric(constants.UnSupportedTarballUrl, 1, Unit.Count);
      return { error: 'UnSupportedTarballUrl' };
    }
    const tarball = await new aws.S3()
      .getObject({
        // Note: we drop anything after the first `.` in the host, as we only care about the bucket name.
        Bucket: tarballUri.host.split('.')[0],
        // Note: the pathname part is absolute, so we strip the leading `/`.
        Key: tarballUri.pathname.replace(/^\//, ''),
        VersionId: tarballUri.searchParams.get('versionId') ?? undefined,
      })
      .promise();
    let packageJson: Buffer;

    try {
      ({ packageJson } = await extractObjects(
        Buffer.from(tarball.Body! as any),
        {
          packageJson: { path: 'package/package.json', required: true },
        }
      ));
    } catch (err) {
      console.error(`Invalid tarball content: ${err}`);
      metrics.putMetric(constants.InvalidTarball, 1, Unit.Count);
      metrics.putMetric(constants.AllErrors, 1, Unit.Count);
      return { error: 'InvalidTarball' };
    }
    let packageJsonObj;
    try {
      packageJsonObj = JSON.parse(packageJson.toString('utf-8'));
    } catch (e) {
      metrics.putMetric(constants.InvalidPackageJson, 1, Unit.Count);
      metrics.putMetric(constants.AllErrors, 1, Unit.Count);
      return { error: 'InvalidPackageJson' };
    }
    const { repository } = packageJsonObj;
    const repoDetails = getGithubRepoDetails(repository);

    if (!repoDetails?.owner || !repoDetails?.repo) {
      console.error(`No repository information present ${packageJson}`);
      metrics.putMetric(constants.UnSupportedRepo, 1, Unit.Count);
      metrics.putMetric(constants.AllErrors, 1, Unit.Count);
      return { error: 'UnSupportedRepo' };
    }
    let releaseNotes: string | void;
    try {
      releaseNotes = await generateReleaseNotes(
        repoDetails.owner,
        repoDetails.repo,
        packageJsonObj.name,
        packageJsonObj.version,
        repoDetails.directory
      );
      if (releaseNotes) {
        metrics.putMetric(constants.PackageWithChangeLog, 1, Unit.Count);
        const releaseNotesPath = tarballUri.pathname
          .replace('package.tgz', 'release-notes.md')
          .substring(1);
        console.log(
          `storing release notes to s3://${BUCKET_NAME}${releaseNotesPath}`
        );
        await new aws.S3()
          .putObject({
            Bucket: BUCKET_NAME,
            Key: releaseNotesPath,
            Body: releaseNotes,
            ContentType: 'text/markdown',
            Metadata: {
              'Lambda-Log-Group': context.logGroupName,
              'Lambda-Log-Stream': context.logStreamName,
              'Lambda-Run-Id': context.awsRequestId,
            },
          })
          .promise();
      } else {
        console.log('No release notes found');
        metrics.putMetric(constants.PackageWithChangeLog, 0, Unit.Count);
      }
      metrics.putMetric(constants.ChangelogFetchError, 0, Unit.Count);
      metrics.putMetric(constants.InvalidPackageJson, 0, Unit.Count);
      metrics.putMetric(constants.InvalidCredentials, 0, Unit.Count);
      metrics.putMetric(constants.InvalidTarball, 0, Unit.Count);
      metrics.putMetric(constants.RequestQuotaExhausted, 0, Unit.Count);
      metrics.putMetric(constants.UnknownError, 0, Unit.Count);
    } catch (e) {
      metrics.putMetric(constants.AllErrors, 1, Unit.Count);
      console.log('error when fetching the release notes', e);
      metrics.putMetric(constants.ChangelogFetchError, 1, Unit.Count);
      if ((e as any).status == 401) {
        metrics.putMetric(constants.InvalidCredentials, 1, Unit.Count);
        return { error: 'InvalidCredentials' };
      } else if ((e as any).status === 403) {
        metrics.putMetric(constants.RequestQuotaExhausted, 1, Unit.Count);
        return { error: 'RequestQuotaExhausted' };
      }
      metrics.putMetric(constants.RequestQuotaExhausted, 1, Unit.Count);
      return { error: 'UnknownError:' + e };
    }
    return { error: null, releaseNotes };
  }
);

function getGithubRepoDetails(
  repositoryDetails?:
    | {
        url: string;
        directory?: string;
      }
    | string
): { owner: string; repo: string; directory?: string } | undefined {
  if (repositoryDetails && typeof repositoryDetails === 'object') {
    if (repositoryDetails.url.startsWith('https://github.com/')) {
      const slug = repositoryDetails.url.replace('https://github.com/', '');
      const [owner, repo = ''] = slug.split('/');
      return {
        owner,
        repo: repo.replace('.git', ''),
        directory: repositoryDetails.directory,
      };
    } else if (repositoryDetails.url.startsWith('git@github.com:')) {
      const slug = repositoryDetails.url.replace('git@github.com:', '');
      const [owner, repo = ''] = slug.split('/');
      return {
        owner,
        repo: repo.replace('.git', ''),
        directory: repositoryDetails.directory,
      };
    }
  } else if (
    typeof repositoryDetails === 'string' &&
    repositoryDetails.startsWith('github:')
  ) {
    const slug = repositoryDetails.replace('github:', '');
    const [owner, repo] = slug.split('/');
    return { owner, repo };
  }
  return;
}
