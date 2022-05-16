import { Octokit } from '@octokit/rest';
import * as changelogFilenameRegex from 'changelog-filename-regex';
import getReleaseNotesMd from './md-changelog-parser.lambda-shared.js';

export async function getReleaseNotesFromAllReleases(
  octakit: Octokit,
  owner: string,
  repo: string,
  projectName: string,
  version: string
): Promise<string | undefined> {
  const iterator = octakit.paginate.iterator(octakit.rest.repos.listReleases, {
    owner,
    repo,
  });
  for await (const item of iterator) {
    try {
      const result = item.data.find(
        (release) =>
          release.tag_name === `v${version}` ||
          release.tag_name === `${projectName}/${version}` ||
          release.tag_name === `${projectName}/v${version}`
      );
      if (result) {
        return result.body ?? undefined;
      }
    } catch (e) {
      const error = e as any;
      if (error.status >= 400 && error.status < 500) {
        throw e;
      }
    }
  }
  return undefined;
}

export async function getChangelogFileFromGitHub(
  octokit: Octokit,
  owner: string,
  repo: string,
  directory?: string
): Promise<string | undefined> {
  if (directory) {
    directory = directory.trim();
    if (!directory.endsWith('/')) {
      directory = `${directory}/`;
    }
  }

  try {
    // 1. Get the name of the default branch
    const repository = await octokit.rest.repos.get({
      owner,
      repo: repo,
    });
    const branch = repository.data.default_branch || 'main';

    const tree = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      ...(directory ? { recursive: 'true' } : {}),
    });

    const changeLogFiles = tree.data.tree
      .filter(
        (entry) =>
          entry?.type === 'blob' &&
          entry.path &&
          changelogFilenameRegex.test(entry.path)
      )
      .filter((e) => {
        return (
          (directory &&
            e.path?.startsWith(directory) &&
            !e.path.replace(directory, '').includes('/')) || // changelog in the directory of the package in monorepo
          !e.path?.includes('/') // changelog at the root of the repo
        );
      })
      .sort((_a, b) => (directory && b.path!.startsWith(directory) ? 1 : -1)); // move the changelog in the directory to the top

    if (changeLogFiles.length === 0) {
      console.log('no changelog found in github');
      return undefined;
    }

    const blob = await octokit.rest.git.getBlob({
      owner: owner,
      repo: repo,
      file_sha: changeLogFiles[0].sha!,
    });
    const c = Buffer.from(blob.data.content, 'base64').toString();
    return c;
  } catch (e) {
    const error = e as any;
    if (error.status >= 400 && error.status < 500) {
      throw e;
    }
    return undefined;
  }
}

export async function getReleaseNotesFromChangelogFile(
  octakit: Octokit,
  owner: string,
  repo: string,
  version: string,
  directory?: string
): Promise<string | void> {
  const changelog = await getChangelogFileFromGitHub(
    octakit,
    owner,
    repo,
    directory
  );
  if (changelog) {
    return getReleaseNotesMd(changelog, version);
  }
}

async function getReleaseNotesFromTag(
  octokit: Octokit,
  owner: string,
  repo: string,
  version: string,
  projectName?: string
): Promise<string | undefined> {
  try {
    const release = octokit.rest.repos.getReleaseByTag({
      owner,
      repo,
      tag: `v${version}`,
    });
    return (await release).data.body ?? undefined;
  } catch (e) {
    const error = e as any;
    // 404 error means no release with the given tag
    if (error.status >= 400 && error.status < 500 && error.status !== 404) {
      throw e;
    }
  }

  try {
    const release = octokit.rest.repos.getReleaseByTag({
      owner,
      repo,
      tag: `${projectName}/v${version}`,
    });
    return (await release).data.body ?? undefined;
  } catch (e) {
    const error = e as any;
    if (error.status >= 400 && error.status < 500 && error.status !== 404) {
      throw e;
    }
    return undefined;
  }
}

export async function generateReleaseNotes(
  owner: string,
  repo: string,
  projectName: string,
  version: string,
  directory?: string
): Promise<string | void> {
  let changelog: string | void;

  const octakit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    userAgent: 'github-changelog-generator',
  });

  changelog = await getReleaseNotesFromTag(
    octakit,
    owner,
    repo,
    version,
    projectName
  );
  if (!changelog) {
    changelog = await getReleaseNotesFromAllReleases(
      octakit,
      owner,
      repo,
      projectName,
      version
    );
  } else if (!changelog) {
    changelog = await getReleaseNotesFromChangelogFile(
      octakit,
      owner,
      repo,
      version,
      directory
    );
  }
  return changelog;
}

export async function getServiceLimits(): Promise<{
  limit: number;
  remaining: number;
  reset: number;
  used: number;
}> {
  const octakit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    userAgent: 'github-changelog-generator',
  });
  const response = await octakit.rest.rateLimit.get();
  return response.data.resources.core;
}
