import type * as child_process from 'child_process';
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';

// eslint-disable-next-line import/no-unresolved
import type { S3Event } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import { TargetLanguage } from 'jsii-rosetta';
import type { transliterateAssembly } from 'jsii-rosetta/lib/commands/transliterate';

import { handler } from '../../../backend/transliterator/transliterator.lambda';

jest.mock('child_process');
jest.mock('jsii-rosetta/lib/commands/transliterate');

beforeEach((done) => {
  AWSMock.setSDKInstance(AWS);
  done();
});

afterEach((done) => {
  AWSMock.restore();
  jest.resetAllMocks();
  done();
});

test('basic usage', async () => {
  // GIVEN
  const packageName = 'package-name';
  const packageVersion = '1.2.3-dev.4';
  const payload: S3Event = {
    Records: [{
      awsRegion: 'bemuda-triangle-1',
      eventVersion: '1337',
      eventSource: 's3:DummySource',
      eventName: 's3:DummyEvent',
      eventTime: '1789-07-14T00:00:00+02:00',
      userIdentity: { principalId: 'aws::principal::id' },
      requestParameters: { sourceIPAddress: '127.0.0.1' },
      responseElements: {
        'x-amz-id-2': '456',
        'x-amz-request-id': '123',
      },
      s3: {
        bucket: {
          name: 'dummy-bucket',
          arn: 'arn:aws:s3:::dummy-bucket',
          ownerIdentity: { principalId: 'aws::principal::id' },
        },
        configurationId: '42',
        object: {
          eTag: 'eTag',
          key: `packages/${packageName}/v${packageVersion}/package.tgz`,
          sequencer: 'Seq',
          size: 1337,
          versionId: 'VersionId',
        },
        s3SchemaVersion: '1',
      },
    }],
  };
  const mockContext = {} as any;
  const mockTarballBytes = randomBytes(128);
  const mockOutputAssembly = randomBytes(128);

  AWSMock.mock('S3', 'getObject', (request: AWS.S3.GetObjectRequest, callback: Response<AWS.S3.GetObjectOutput>) => {
    try {
      expect(request.Bucket).toBe(payload.Records[0].s3.bucket.name);
      expect(request.Key).toBe(payload.Records[0].s3.object.key);
      expect(request.VersionId).toBe(payload.Records[0].s3.object.versionId);
    } catch (e) {
      callback(e);
    }

    callback(null, {
      Body: mockTarballBytes,
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockSpawn = require('child_process').spawn as jest.MockedFunction<typeof child_process.spawn>;
  mockSpawn.mockImplementation((cmd: string, args: readonly string[], opts: child_process.SpawnOptions) => {
    expect(cmd).toBe('npm');
    expect(args).toContain('install');
    expect(args).toContain('--ignore-scripts'); // Ensures lifecycle hooks don't run
    expect(args).toContain('--no-bin-links'); // Ensures we don't attempt to add bin-links to $PATH
    expect(opts.cwd).toBeDefined();
    expect(opts.stdio).toEqual(['ignore', 'inherit', 'inherit']);

    const tarballPath = args[args.length - 1];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('fs').readFileSync(tarballPath)).toEqual(mockTarballBytes);

    return new MockChildProcess(cmd, Array.from(args), fs.mkdir(path.join(opts.cwd!, 'node_modules', packageName), { recursive: true }));
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mockTransliterateAssembly = require('jsii-rosetta/lib/commands/transliterate').transliterateAssembly as jest.MockedFunction<typeof transliterateAssembly>;
  mockTransliterateAssembly.mockImplementation(async ([dir, ...otherDirs], languages) => {
    expect(languages).toEqual([TargetLanguage.PYTHON]);
    expect(dir).toMatch(new RegExp(path.join('', 'node_modules', packageName) + '$'));
    expect(otherDirs).toEqual([]);

    return fs.writeFile(path.resolve(dir, '.jsii.python'), mockOutputAssembly);
  });

  const key = payload.Records[0].s3.object.key.replace(/\/package\.tgz$/, '/assembly-python.json');
  AWSMock.mock('S3', 'putObject', (request: AWS.S3.PutObjectRequest, callback: Response<AWS.S3.PutObjectOutput>) => {
    try {
      expect(request.Bucket).toBe(payload.Records[0].s3.bucket.name);
      expect(request.Key).toBe(key);
      expect(request.Body).toEqual(mockOutputAssembly);
    } catch (e) {
      return callback(e);
    }

    callback(null, { VersionId: 'New-VersionID' });
  });

  // WHEN
  const result = handler(payload, mockContext);

  // THEN
  await expect(result).resolves.toEqual([{ bucket: payload.Records[0].s3.bucket.name, key, versionId: 'New-VersionID' }]);
  debugger;
  expect(mockSpawn).toHaveBeenCalled();
  expect(mockTransliterateAssembly).toHaveBeenCalled();
});

type Response<T> = (err: Error | null, data?: T) => void;

class MockChildProcess extends EventEmitter implements child_process.ChildProcess {
  public readonly stdin = null;
  public readonly stdout = null;
  public readonly stderr = null;
  public readonly stdio = [this.stdin, this.stdout, this.stderr, null, null] as child_process.ChildProcess['stdio'];

  public readonly exitCode = 0;
  public readonly killed = false;
  public readonly signalCode = null;

  public readonly pid = -1; // Obviously fake

  public constructor(public readonly spawnfile: string, public readonly spawnargs: string[], promise: Promise<unknown>) {
    super();

    promise.then(
      () => this.emit('close', this.exitCode, this.signalCode),
      (err) => this.emit('error', err),
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
