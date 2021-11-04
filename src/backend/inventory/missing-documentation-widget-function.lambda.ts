import { gunzipSync } from 'zlib';
import { sort as semverSort } from 'semver';
import { s3 } from '../shared/aws.lambda-shared';
import { missingDocumentationKey } from '../shared/constants';
import { requireEnv } from '../shared/env.lambda-shared';
import { DocumentationLanguage } from '../shared/language';

/// @singleton MissingDocumnetationWidget-Handler

interface Event {
  readonly describe: boolean;
  readonly widgetContext: WidgetContext;
}

export async function handler({ describe, widgetContext }: Event): Promise<string | { markdown: string }> {
  console.log(`Event: ${JSON.stringify({ describe, widgetContext }, null, 2)}`);

  if (describe) {
    // Description is naked markdown, and nothing else. The first YAML block it
    // contains is going to be used to pre-populate parameters in the widget
    // creation GUI.
    return [
      '### Missing Documentation widget',
      '',
      'This widget will render the contents of the missing documentations object',
      'from S3. It requires the following parameters:',
      '',
      '- `language`: the DocumentationLanguage for which missing documentation should',
      '  be listed.',
      '',
      'Example:',
      '```yaml',
      `language: csharp # One of: ${DocumentationLanguage.ALL.map(({ name }) => name).join(' | ')}`,
      '```',
    ].join('\n');
  }

  try {
    const language = DocumentationLanguage.fromString(widgetContext.params.language);
    const bucketName = requireEnv('BUCKET_NAME');
    const key = missingDocumentationKey(language);

    let { Body, ContentEncoding, LastModified } = await s3().getObject({
      Bucket: bucketName,
      Key: key,
    }).promise();
    // If it was compressed, de-compress it now...
    if (ContentEncoding === 'gzip') {
      Body = gunzipSync(Buffer.from(Body!));
    }

    const list = Array.from((JSON.parse(Body!.toString('utf-8')) as string[])
      .reduce(
        (map, entry) => {
          // Split on the @ that is not at the beginning of the string
          const [name, version] = entry.split(/(?!^)@/);
          if (!map.has(name)) {
            map.set(name, []);
          }
          map.get(name)!.push(version);
          return map;
        },
        new Map<string, string[]>(),
      )
      .entries())
      .sort(([l], [r]) => l.localeCompare(r));

    // Trying to ensure we don't cause the dashboard to hang due to large DOM.
    const maxCount = 100;
    const objectUrl = `${widgetContext.domain}/s3/object/${bucketName}?prefix=${key}`;

    return {
      markdown: [
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
          return `${index + 1} | \`${name}\` | ${versions.length} | ${versions.map((v) => `\`${v}\``).join(', ')}`;
        }),
        '',
        `Last updated: \`${LastModified?.toISOString() ?? 'N/A'}\``,
      ].join('\n'),
    };
  } catch (error) {
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
