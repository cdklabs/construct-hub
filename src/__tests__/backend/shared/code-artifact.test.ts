import type * as child_process from 'child_process';
import { randomBytes } from 'crypto';

import { EventEmitter } from 'stream';
import {
  CodeartifactClient,
  GetAuthorizationTokenCommand,
} from '@aws-sdk/client-codeartifact';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { logInWithCodeArtifact } from '../../../backend/shared/code-artifact.lambda-shared';

jest.mock('child_process');

const codeArtifactMock = mockClient(CodeartifactClient);

beforeEach(() => {
  codeArtifactMock.reset();
});

test('logInWithCodeArtifact', async () => {
  // GIVEN
  const protoEndpoint = '//fake.npm.endpoint';
  const endpoint = `https:${protoEndpoint}`;
  const domain = 'fake-domain-name';
  const domainOwner = '123456789012';
  const apiEndpoint = 'https://fake.codeartifact.api.endpoint';

  const authorizationToken = randomBytes(64).toString('base64');
  codeArtifactMock.on(GetAuthorizationTokenCommand).resolves({
    authorizationToken,
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockSpawn = require('child_process').spawn as jest.MockedFunction<
    typeof child_process.spawn
  >;
  const configToSet = new Set([
    `registry=${endpoint}`,
    `${protoEndpoint}:_authToken=${authorizationToken}`,
    `${protoEndpoint}:always-auth=true`,
  ]);
  mockSpawn.mockImplementation(
    (
      cmd: string,
      args: readonly string[],
      opts: child_process.SpawnOptions
    ) => {
      let result = Promise.resolve(null);
      try {
        expect(cmd).toBe('npm');

        const [config, set, keyValuePair, ...rest] = args;
        expect(rest).toEqual([]);
        expect(config).toBe('config');
        expect(set).toBe('set');
        expect(configToSet).toContain(keyValuePair);
        configToSet.delete(keyValuePair); // Set, remove it from here...

        expect(opts.stdio).toEqual(['ignore', 'inherit', 'inherit']);
      } catch (e) {
        result = Promise.reject(e);
      }
      return new MockChildProcess(cmd, Array.from(args), result);
    }
  );

  // THEN
  await expect(
    logInWithCodeArtifact({ endpoint, domain, domainOwner, apiEndpoint })
  ).resolves.not.toThrow();

  expect(Array.from(configToSet)).toEqual([]); // All config was set as expected.
  expect(codeArtifactMock).toHaveReceivedCommandWith(
    GetAuthorizationTokenCommand,
    {
      domain,
      domainOwner,
      durationSeconds: 0,
    }
  );
});

class MockChildProcess
  extends EventEmitter
  implements child_process.ChildProcess
{
  public readonly stdin = null;
  public readonly stdout = null;
  public readonly stderr = null;
  public readonly stdio = [
    this.stdin,
    this.stdout,
    this.stderr,
    null,
    null,
  ] as child_process.ChildProcess['stdio'];

  public readonly exitCode = 0;
  public readonly killed = false;
  public readonly signalCode = null;

  public readonly pid = -1; // Obviously fake

  public constructor(
    public readonly spawnfile: string,
    public readonly spawnargs: string[],
    promise: Promise<unknown>
  ) {
    super();

    promise.then(
      () => this.emit('close', this.exitCode, this.signalCode),
      (err) => this.emit('error', err)
    );
  }

  public get connected(): never {
    throw new Error('Not Implemented');
  }

  public disconnect(): never {
    throw new Error('Not Implemented');
  }

  public kill(): never {
    throw new Error('Not Implemented');
  }

  public ref(): never {
    throw new Error('Not Implemented');
  }

  public send(): never {
    throw new Error('Not Implemented');
  }

  public unref(): never {
    throw new Error('Not Implemented');
  }
}
