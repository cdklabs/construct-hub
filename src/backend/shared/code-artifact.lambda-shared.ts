import { tmpdir } from 'os';
import { join } from 'path';
import { CodeArtifact } from 'aws-sdk';
import { mkdtemp, remove, writeFile } from 'fs-extra';
import { shellOut, shellOutWithOutput } from './shell-out.lambda-shared';

export interface CodeArtifactProps {
  /**
   * The endpoint for the CodeArtifact NPM registry. It is a complete URL
   * (including protocol, and path).
   */
  readonly endpoint: string;

  /**
   * The name of the CodeArtifact domain that contains the NPM registry.
   */
  readonly domain: string;

  /**
   * The owner of the CodeArtifact domain that contains the NPM registry.
   */
  readonly domainOwner?: string;

  /**
   * The CodeArtifact API endpoints to be used (e.g: VPC Endpoints).
   */
  readonly apiEndpoint?: string;
}

/**
 * Logs into the provided CodeArtifact registry, and makes it the default NPM
 * registry for this environment.
 */
export async function logInWithCodeArtifact({ endpoint, domain, domainOwner, apiEndpoint }: CodeArtifactProps) {
  // Remove the protocol part of the endpoint URL, keeping the rest intact.
  const protoRelativeEndpoint = endpoint.replace(/^[^:]+:/, '');

  const { authorizationToken } = await new CodeArtifact({ endpoint: apiEndpoint }).getAuthorizationToken({
    domain,
    domainOwner,
    durationSeconds: 0, // Expires at the same time as the temporary credentials in use.
  }).promise();

  await shellOut('npm', 'config', 'set', `registry=${endpoint}`);
  await shellOut('npm', 'config', 'set', `${protoRelativeEndpoint}:_authToken=${authorizationToken}`);
  await shellOut('npm', 'config', 'set', `${protoRelativeEndpoint}:always-auth=true`);
}

/**
 * Publishes the provided tarball to the specified CodeArtifact repository.
 *
 * @param tarball a Buffer containing the tarball for the published package.
 * @param opts    the informations about the CodeArtifact repository.
 */
export async function codeArtifactPublishPackage(tarball: Buffer, opts: CodeArtifactProps) {
  // Working in a temporary directory, so we can log into CodeArtifact and not leave traces.
  const cwd = await mkdtemp(join(tmpdir(), 'npm-publish-'));
  const oldHome = process.env.HOME;
  try {
    process.env.HOME = cwd;
    await logInWithCodeArtifact(opts);
    const tarballPath = join(cwd, 'tarball.tgz');
    await writeFile(tarballPath, tarball);
    const { exitCode, signal, stdout } = await shellOutWithOutput('npm', 'publish', '--json', tarballPath);
    if (exitCode === 0) {
      return;
    }
    if (signal != null) {
      throw new Error(`npm publish was killed by signal ${signal}`);
    }
    const result = JSON.parse(stdout.toString('utf-8'));
    if (result.error?.code === 'E409') {
      console.log('E409 - The package already exist; assuming idempotent success!');
      return;
    } else {
      throw new Error(`npm publish returned ${JSON.stringify(result)}`);
    }
  } finally {
    // Restore the previous environment, and remove temporary directory
    process.env.HOME = oldHome;
    await remove(cwd);
  }
}
