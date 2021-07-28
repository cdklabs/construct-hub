import * as https from 'https';
import { URL } from 'url';

import { metricScope, Unit } from 'aws-embedded-metrics';
import type { Context, SQSEvent } from 'aws-lambda';
import * as aws from '../shared/aws.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';
import type { IngestionInput } from '../shared/ingestion-input.lambda-shared';
import { integrity } from '../shared/integrity.lambda-shared';
import { MetricName, METRICS_NAMESPACE, S3KeyPrefix } from './constants';
import type { UpdatedVersion } from './version-info.lambda-shared';

export const handler = metricScope((metrics) => async (event: SQSEvent, context: Context) => {
  metrics.setNamespace(METRICS_NAMESPACE);

  const bucket = requireEnv('BUCKET_NAME');
  const queueUrl = requireEnv('QUEUE_URL');

  const messages = await Promise.all(
    event.Records
      .map((record) => JSON.parse(record.body, (k, v) => k === 'modified' ? new Date(v) : v) as UpdatedVersion)
      .map(stageUpdatedVersion),
  );

  console.log(`Sending ${messages.length} for ingestion`);
  await aws.sqsSendMessageBatch(queueUrl, messages);

  async function stageUpdatedVersion({ infos, modified, seq }: UpdatedVersion): Promise<IngestionInput> {
    const startTime = Date.now();
    const tarball = await httpGet(infos.dist.tarball);

    // Store the tarball into the staging bucket
    // - infos.dist.tarball => https://registry.npmjs.org/<@scope>/<name>/-/<name>-<version>.tgz
    // - stagingKey         =>                     staged/<@scope>/<name>/-/<name>-<version>.tgz
    const stagingKey = `${S3KeyPrefix.STAGED_KEY_PREFIX}${new URL(infos.dist.tarball).pathname}`.replace(/\/{2,}/g, '/');
    await aws.s3PutObject(
      context,
      bucket,
      stagingKey,
      tarball,
      {
        Metadata: {
          'Modified-At': modified.toISOString(),
          'Origin-Integrity': infos.dist.shasum,
          'Origin-Uri': infos.dist.tarball,
          'Sequence': seq.toFixed(),
        },
      });
    metrics.putMetric(MetricName.STAGING_TIME, Date.now() - startTime, Unit.Milliseconds);
    console.log(`Uploaded: ${stagingKey}`);

    // Prepare SQS message for ingestion
    const messageBase = {
      tarballUri: `s3://${bucket}/${stagingKey}`,
      metadata: {
        dist: infos.dist.tarball,
        seq: seq.toFixed(),
      },
      time: modified.toUTCString(),
    };
    return {
      ...messageBase,
      integrity: integrity(messageBase, tarball),
    };
  }
});

/**
 * Makes an HTTP GET request, and returns the resulting payload.
 *
 * @param url the URL to get.
 *
 * @returns a Buffer containing the received data.
 */
function httpGet(url: string) {
  return new Promise<Buffer>((ok, ko) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        throw new Error(`Unsuccessful GET: ${response.statusCode} - ${response.statusMessage}`);
      }

      let body = Buffer.alloc(0);
      response.on('data', (chunk) => body = Buffer.concat([body, Buffer.from(chunk)]));
      response.once('close', () => ok(body));
      response.once('error', ko);
    });
  });
}
