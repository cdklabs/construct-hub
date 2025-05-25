import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NodeJsRuntimeStreamingBlobPayloadOutputTypes } from '@smithy/types';
import { sort as semverSort } from 'semver';
import { S3_CLIENT } from '../shared/aws.lambda-shared';
import { decompressContent } from '../shared/compress-content.lambda-shared';
import { requireEnv } from '../shared/env.lambda-shared';

/// @singleton PackageVersionsTableWidget-Handler

interface Event {
  readonly key: string;
  readonly description: string;
  readonly widgetContext: WidgetContext;
}

export async function handler({
  key,
  description,
  widgetContext,
}: Event): Promise<string | { markdown: string }> {
  console.log(
    `Event: ${JSON.stringify({ key, description, widgetContext }, null, 2)}`
  );

  try {
    const bucketName = requireEnv('BUCKET_NAME');

    const res = await S3_CLIENT.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

    if (!res.Body) {
      throw new Error('Response Body is empty');
    }
    const body = await decompressContent(
      res.Body as NodeJsRuntimeStreamingBlobPayloadOutputTypes,
      res.ContentEncoding
    );

    const list = Array.from(
      (JSON.parse(body) as string[])
        .reduce((map, entry) => {
          // Split on the @ that is not at the beginning of the string
          const [name, version] = entry.split(/(?!^)@/);
          if (!map.has(name)) {
            map.set(name, []);
          }
          map.get(name)!.push(version);
          return map;
        }, new Map<string, string[]>())
        .entries()
    ).sort(([l], [r]) => l.localeCompare(r));

    // Trying to ensure we don't cause the dashboard to hang due to large DOM.
    const maxCount = 100;
    const objectUrl = `${widgetContext.domain}/s3/object/${bucketName}?prefix=${key}`;

    return {
      markdown: [
        description,
        ...(list.length > maxCount
          ? [
              `Showing only the first ${maxCount} packages.`,
              `The complete list can be obtained [from S3](${objectUrl}).`,
              '',
            ]
          : []),
        'Id | Package Name | Count | Versions',
        '--:|--------------|-------|---------',
        ...list.slice(0, maxCount).map(([name, versions], index) => {
          versions = semverSort(versions).reverse();
          return `${index + 1} | \`${name}\` | ${versions.length} | ${versions
            .map((v) => `[\`${v}\`](${s3ConsoleUrl(bucketName, name, v)})`)
            .join(', ')}`;
        }),
        '',
        `Last updated: \`${res.LastModified?.toISOString() ?? 'N/A'}\``,
      ].join('\n'),
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        markdown: [
          '**⚠️ An error occurred**',
          `- **name:** \`${error.name}\``,
          `- **message:** ${error.message}`,
          '- **stack:**',
          '  ```',
          error.stack?.replace(/^/g, '  '),
          '  ```',
        ].join('\n'),
      };
    }
    throw error;
  }
}

export interface WidgetContext {
  readonly dashboardName: string;
  readonly widgetId: string;
  readonly domain: string;
  readonly accountId: string;
  readonly locale: string;
  readonly timezone: {
    readonly label: string;
    readonly offsetISO: string;
    readonly offsetInMinutes: number;
  };
  readonly period: number;
  readonly isAutoPeriod: true;
  readonly timeRange: {
    readonly mode: 'relative' | 'absolute';
    readonly start: number;
    readonly end: number;
    readonly relativeStart: number;
    readonly zoom: {
      readonly start: number;
      readonly end: number;
    };
  };
  readonly theme: 'light' | 'dark';
  readonly linkCharts: boolean;
  readonly title: string;
  readonly forms: {
    readonly all: { readonly [key: string]: string };
  };
  readonly params: { readonly [key: string]: string };
  readonly width: number;
  readonly height: number;
}

function s3ConsoleUrl(
  bucket: string,
  packageName: string,
  packageVersion: string
) {
  const encodedPrefix = encodeURIComponent(
    `data/${packageName}/v${packageVersion}/`
  );
  return `https://s3.console.aws.amazon.com/s3/buckets/${bucket}?prefix=${encodedPrefix}&showversions=false`;
}
