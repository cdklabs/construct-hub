import type { createGunzip } from 'zlib';
import { Context, SQSEvent } from 'aws-lambda';
import type { metricScope, MetricsLogger } from 'aws-embedded-metrics';
import * as AWS from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import type { extract, Headers } from 'tar-stream';
import type { requireEnv } from '../../../backend/shared/env.lambda-shared';
import { reset } from '../../../backend/shared/aws.lambda-shared';

jest.mock('zlib');
jest.mock('aws-embedded-metrics');
jest.mock('tar-stream');
jest.mock('../../../backend/shared/env.lambda-shared');

const mockMetricScope = require('aws-embedded-metrics').metricScope as jest.MockedFunction<typeof metricScope>;
const mockMetrics: MetricsLogger = { setDimensions: (...args: any[]) => expect(args).toEqual([]) } as any;
mockMetricScope.mockImplementation((cb) => {
  const impl = cb(mockMetrics);
  return async (...args) => impl(...args);
});

import { handler } from '../../../backend/ingestion/ingestion.lambda';
import EventEmitter = require('events');

beforeEach((done) => {
  AWSMock.setSDKInstance(AWS);
  done();
});

afterEach((done) => {
  AWSMock.restore();
  reset();
  done();
});

test('handler', () => {
  const mockBucketName = 'fake-bucket';

  const mockRequireEnv = require('../../../backend/shared/env.lambda-shared').requireEnv as jest.MockedFunction<typeof requireEnv>;
  mockRequireEnv.mockImplementation((name) => {
    if (name === 'BUCKET_NAME') {
      return mockBucketName;
    }
    throw new Error(`Bad environment variable: "${name}"`);
  });

  const stagingBucket = 'staging-bucket';
  const stagingKey = 'staging-key';
  const stagingVersion = 'staging-version-id';
  const fakeTarGz = 'fake-tarball-content[gzipped]';
  const fakeTar = Buffer.from('fake-tarball-content');
  const tarballUri = `s3://${stagingBucket}.test-bermuda-2.s3.amazonaws.com/${stagingKey}?versionId=${stagingVersion}`;
  const time = '2021-07-12T15:18:00.000000+02:00';
  const integrity = 'sha256-1RyNs3cDpyTqBMqJIiHbCpl8PEN6h3uWx3lzF+3qcmY=';

  AWSMock.mock('S3', 'getObject', (req: AWS.S3.GetObjectRequest, cb: Response<AWS.S3.GetObjectOutput>) => {
    try {
      expect(req.Bucket).toBe(stagingBucket);
      expect(req.Key).toBe(stagingKey);
      expect(req.VersionId).toBe(stagingVersion);
    } catch (e) {
      return cb(e);
    }
    return cb(null, { Body: fakeTarGz });
  });

  const mockCreateGunzip = require('zlib').createGunzip as jest.MockedFunction<typeof createGunzip>;
  mockCreateGunzip.mockImplementation(() => new FakeGunzip(fakeTarGz, fakeTar) as any);

  const mockExtract = require('tar-stream').extract as jest.MockedFunction<typeof extract>;
  mockExtract.mockImplementation(() => new FakeExtract(fakeTar, {}) as any);

  const event: SQSEvent = {
    Records: [{
      attributes: {} as any,
      awsRegion: 'test-bermuda-1',
      body: JSON.stringify({ tarballUri, integrity, time }),
      eventSource: 'sqs',
      eventSourceARN: 'arn:aws:sqs:test-bermuda-1:123456789012:fake',
      md5OfBody: 'Fake-MD5-Of-Body',
      messageAttributes: {},
      messageId: 'Fake-Message-ID',
      receiptHandle: 'Fake-Receipt-Handke',
    }],
  };
  const context: Context = {} as any;

  return expect(handler(event, context)).resolves.toEqual([{}]);
});

type Response<T> = (err: AWS.AWSError | null, data?: T) => void;

class FakeGunzip extends EventEmitter {
  private sent = 0;

  public constructor(private readonly gz: string, private readonly result: Buffer) {
    super();
  }

  public end(data: Buffer): void {
    try {
      expect(data).toEqual(Buffer.from(this.gz));
      setImmediate(() => this.sendData());
    } catch (e) {
      this.emit('error', e);
    }
  }

  private sendData() {
    if (this.sent >= this.result.length) {
      this.emit('end');
      return;
    }
    this.emit('data', this.result.slice(this.sent, this.sent + 1));
    this.sent++;
    setImmediate(() => this.sendData());
  }
}

class FakeExtract extends EventEmitter {
  private readonly files: Array<[string, string]>;

  public constructor(private readonly tar: Buffer, files: Record<string, string>) {
    super();
    this.files = Object.entries(files);
  }

  public write(data: Buffer, cb?: (err: Error | null) => void): void {
    try {
      expect(data).toEqual(Buffer.from(this.tar));
      cb?.(null);
      setImmediate(() => this.sendNextEntry());
    } catch (e) {
      cb?.(e);
    }
  }

  private sendNextEntry() {
    debugger;
    const nextEntry = this.files.shift();
    if (nextEntry == null) {
      this.emit('finish');
      return;
    }

    const [name, content] = nextEntry;

    const headers: Headers = { name };
    const stream = new FakeStream(Buffer.from(content));
    const next = () => this.sendNextEntry();
    this.emit('entry', headers, stream, next);
  }
}

class FakeStream extends EventEmitter {
  private sent = 0;

  public constructor(private readonly content: Buffer) {
    super();
  }

  public resume() {
    setImmediate(() => this.sendData());
  }

  private sendData() {
    if (this.sent >= this.content.length) {
      this.emit('end');
      return;
    }
    this.emit('data', this.content.slice(this.sent, this.sent + 1));
    this.sent++;
    setImmediate(() => this.sendData());
  }
}
