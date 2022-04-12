/// @singleton SQSDLQStatsWidget-Handler
const DOCS = `
## Include Text Widget from CloudWatch Dashboard
This widget displays the first text widget from a specified CloudWatch Dashboard. 

This is useful for embedding the same text context in multiple dashboards and update it from a central place. An example would be a menu of links between dashboards.

### Widget parameters
Param | Description
---|---
**title** | Title of the widget
**emptyQueueMessage** | Message to display when there are no visible messages in any of the queues
**nonEmptyQueueMessage** | Message to display when any of the queue contains a message
**queues** | Object containing information about the queues to display

### Example parameters
\`\`\` yaml
{
    "description": "",
    "title": "SQS DLQ",
    "emptyQueueMessage": "There are no messages in the DLQs. This is normal and no action is required.",
    "nonEmptyQueueMessage": "There are some message in the DLQ. The table below lists the queues with non-empty DLQs. Please check the DLQs and re-drive the messages.",
    "queues": {
        "construct-hub-dev-ConstructHubOrchestrationDLQ9C6D9BD4-rlooG5g8o3YA": {
            "name": "Orchestration DLQ",
            "queueName": "construct-hub-dev-ConstructHubOrchestrationDLQ9C6D9BD4-rlooG5g8o3YA",
            "reDriveFunctionArn": "arn:aws:lambda:us-east-2:123457424:function:construct-hub-dev-ConstructHubOrchestrationRedrive-bWYSY5KWfUUU"
        },
        "construct-hub-dev-ConstructHubIngestionDLQ3E96A5F2-6niMeQlEH0X0": {
            "name": "Ingestion DLQ",
            "queueName": "construct-hub-dev-ConstructHubIngestionDLQ3E96A5F2-6niMeQlEH0X0"
        },
        "construct-hub-dev-ConstructHubSourcesStagerDLQ80BD2600-AlCVN3KCXFPo": {
            "name": "NPM JS Stager DLQ",
            "queueName": "construct-hub-dev-ConstructHubSourcesStagerDLQ80BD2600-AlCVN3KCXFPo"
        }
    }
}
\`\`\`
`;

import { CloudWatch } from 'aws-sdk';
const DURATION = 5; // minutes

interface Event {
  readonly key: string;
  readonly description: string;
  readonly widgetContext: WidgetContext;
  describe?: unknown;
}

type QueueConfig = {
  queueName: string;
  name: string;
  reDriveFunctionArn?: string;
}

export async function handler(event: Event): Promise<string | { markdown: string }> {
  console.log(event);
  try {
    if (event.describe) {
      return DOCS;
    }

    const queues = event.widgetContext.params?.queues;
    if (Object.keys(queues).length === 0) {
      return 'No queue names specified';
    }

    const data = await getVisibleMessageCount(queues);

    const heading = `<h4>${event.widgetContext.title}</h4>`;
    const description = event.widgetContext.params.description ? `<p>${event.widgetContext.params.description}</p>` : '';
    let rest = '';
    if (Object.keys(data).length > 0 && Object.values(data).some(d => d > 0)) {
      const filteredData = Object.entries(data)
        .filter(([_, count]) => count > 0)
        .reduce((acc, [queueName, count]) => ({ ...acc, [queueName]: count }), {} as Record<string, number>);
      const table = generateTable(filteredData, queues, event.widgetContext);
      console.log(table);
      rest = `<p>${event.widgetContext.params.nonEmptyQueueMessage}</p>${table}`;
    } else {
      rest = `<p>${event.widgetContext.params.emptyQueueMessage}</p>`;
    }
    return [heading, description, rest].join('\n');
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
    };
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
  readonly params: {
    queues: Record<string, QueueConfig>;
    title?: string;
    description?: string;
    emptyQueueMessage?: string;
    nonEmptyQueueMessage?: string;
  };
  readonly width: number;
  readonly height: number;
}

const getVisibleMessageCount = async (queueConfigs: Record<string, QueueConfig>): Promise<Record<string, number>> => {
  // Keeping the time period to 5 minutes to show current state of the queue when re-drive happens
  const queues = Object.values(queueConfigs);
  const params: CloudWatch.GetMetricDataInput = {
    StartTime: new Date(new Date().getTime() - (DURATION * 60 * 1000)), // 5 minutes ago
    EndTime: new Date(), // now
    ScanBy: 'TimestampDescending',
    MetricDataQueries: queues.map((queue, index) => ({
      Id: `m${index}`,
      MetricStat: {
        Period: 60,
        Stat: 'Maximum',
        Metric: {
          Namespace: 'AWS/SQS',
          MetricName: 'ApproximateNumberOfMessagesVisible',
          Dimensions: [
            {
              Name: 'QueueName',
              Value: queue.queueName,
            },
          ],
        },
      },
    })),
  };
  const cloudwatch = new CloudWatch();
  const response = await cloudwatch.getMetricData(params).promise();
  const data = (response.MetricDataResults ?? []).reduce((acc, result) => {
    if (result.Id) {
      const id = Number.parseInt(result.Id.replace('m', ''), 10);
      return { ...acc, [queues[id].queueName]: result.Values?.[0] ?? 0 };
    }
    return acc;
  }, {} as Record<string, number>);
  return data;

};

function generateTable(data: Record<string, number>, queueConfigs: Record<string, QueueConfig>, widgetContext: WidgetContext): string {

  const rows = Object.entries(data).map(([queueName, count]) => {
    const queueConfig = queueConfigs[queueName];
    if (queueConfig) {
      const url = sqsQueueUrl(queueName, widgetContext);
      const reDriveButton = queueConfig?.reDriveFunctionArn ? `<a class="btn btn-primary">ReDrive</a><cwdb-action action="call" display="widget" endpoint="${queueConfig.reDriveFunctionArn}" event="click"></<cwdb-action>` : '';
      const queueLink = `<a class="btn ${!reDriveButton ? 'btn-primary' : ''}" href="${url}">Goto Queue</a>`;
      const row = [queueConfig.name, count, `${queueLink} ${reDriveButton}`].map(d => `<td>${d}</td>`).join('');
      return `<tr>${row}</tr>`;
    }
    return false;
  }).filter(Boolean);

  const tableHeader = ['Queue Name', 'Visible Messages', 'Action'].map(h => `<th>${h}</th>`);
  const tableHeaderRow = `<tr>${tableHeader.join('')}</tr>`;
  const table = ['<table>', tableHeaderRow, ...rows, '</table>'].join('\n');
  return table;
}

function sqsQueueUrl(queueName: string, widgetContext: WidgetContext): string {
  return `/sqs/v2/home#/queues/https%3A%2F%2Fsqs.${process.env.AWS_REGION}.amazonaws.com%2F${widgetContext.accountId}%2F${queueName}`;
}
