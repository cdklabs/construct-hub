import { spawn } from 'child_process';
import { CodeArtifact } from 'aws-sdk';

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

  function shellOut(cmd: string, ...args: readonly string[]): Promise<void> {
    return new Promise<void>((ok, ko) => {
      const child = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
      child.once('error', ko);
      child.once('close', (code, signal) => {
        if (code === 0) {
          return ok();
        }
        const reason = code != null
          ? `exit code ${code}`
          : `signal ${signal}`;
        ko(new Error(`Command "${cmd} ${args.join(' ')}" failed with ${reason}`));
      });
    });
  }
}
