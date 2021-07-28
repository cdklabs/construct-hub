import { resolve } from 'path';

import { Context, ScheduledEvent } from 'aws-lambda';
import { readdir, remove, lstat } from 'fs-extra';
import { requireEnv } from '../shared/env.lambda-shared';

/**
 * Deletes items older than 15 minutes from the directory denoted by
 * EFS_MOUNT_PATH, keeping any item included in subfolders of IGNORE_DIRS (a `:`
 * separated list of directory names).
 */
export async function handler(event: ScheduledEvent, _context: Context): Promise<void> {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);

  const mountPath = resolve(requireEnv('EFS_MOUNT_PATH'));
  const ignoreDirs = new Set(requireEnv('IGNORE_DIRS').split(' ').map((item) => resolve(item)));

  for await (const [directory, date] of leftOverDirectories(mountPath, ignoreDirs)) {
    console.log(`Removing leftover directory (${date.toISOString()}): ${directory}`);
    // Using fs-extra, so this is recursive, and itempotently succeeds if a file us concurrently deleted
    await remove(directory);
  }
}

const FIFTEEN_MINUTES_AS_MILLIS = 900_000 /* ms */;

/**
 * Yields a list of all first-level subdirectories of the provided `root` that
 * are empty or recursively contain only files older than the specified
 * timestamp, expressed as milliseconds since the epoch.
 *
 * @param root the root directory to scan.
 * @param ignoreDirs a set of directories to ignore when scanning.
 * @param olderThan the boundary timestamp, as milliseconds since the epoch.
 *                  Defaults to 15 minutes ago (which is the maximum timeout of
 *                  a Lambda function).
 */
async function* leftOverDirectories(
  root: string,
  ignoreDirs: ReadonlySet<string>,
  olderThan = Date.now() - FIFTEEN_MINUTES_AS_MILLIS,
): AsyncGenerator<[string, Date]> {
  for (const file of await readdir(root)) {
    const fullPath = resolve(root, file);

    // Using lstat so we can expire symlinks correctly.
    const stat = await lstat(fullPath);
    if (stat.isDirectory()) {
      // If the directory is in the ignore list, never yield for deletion
      if (ignoreDirs.has(fullPath)) {
        console.log(`Path is in ignore list: ${fullPath}`);
        continue;
      }
      const newest =await newestFileIn(fullPath);
      if (newest < olderThan) {
        // All files are older than the threshold, so we yield it for deletion
        yield [fullPath, new Date(newest)];
      }
    } else if (stat.isFile() || stat.isSymbolicLink()) {
      console.log(`Ignoring non-directory entity: ${fullPath}`);
    }
  }
}

async function newestFileIn(dir: string): Promise<number> {
  let result: number | undefined;
  for (const file of await readdir(dir)) {
    const fullPath= resolve(dir, file);

    const stat = await lstat(fullPath);
    if (stat.isFile() || stat.isSymbolicLink()) {
      if (result == null || result < stat.mtimeMs) {
        result = stat.mtimeMs;
      }
    } else if (stat.isDirectory()) {
      const children = await newestFileIn(fullPath);
      if (result == null || result < children) {
        result = children;
      }
    } else {
      // Weird file type, we'll leave it there...
      console.log(`Unexpected file type: ${fullPath}...`);
      result = Number.MAX_SAFE_INTEGER;
    }
  }
  // If result is undefined, it means the directory is empty, so we return
  // the EPOCH timestamp (i.e: 0 milliseconds after... EPOCH).
  return result ?? 0;
}
