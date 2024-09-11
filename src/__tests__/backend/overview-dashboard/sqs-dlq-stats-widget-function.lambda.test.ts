import {
  CloudWatchClient,
  GetMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import { mockClient } from 'aws-sdk-client-mock';

import {
  Event,
  handler,
} from '../../../overview-dashboard/sqs-dlq-stats-widget-function.lambda';

test('build stats page', async () => {
  const cloudwatchMock = mockClient(CloudWatchClient);

  const event: Event = {
    description: 'foo',
    key: 'bar',
    widgetContext: {
      params: {
        queues: {
          MyQueue: {
            queueName: 'MyQueue',
            name: 'bar',
            reDriveFunctionArn:
              'arn:aws:lambda:us-east-2:123456789012:function:my-function',
          },
        },
        nonEmptyQueueMessage: 'MyQueue',
      },
      accountId: 'XXXXXXXXXXXX',
      dashboardName: 'MyDashboard',
      domain: 'us-east-1',
      height: 6,
      period: 300,
      title: 'SomeTitle',
      width: 6,
      widgetId: 'abc',
      linkCharts: false,
      locale: 'en-US',
      timezone: {
        label: 'UTC',
        offsetISO: '+0',
        offsetInMinutes: 0,
      },
      isAutoPeriod: true,
      theme: 'dark',
      timeRange: {
        mode: 'relative',
        start: 0,
        end: 0,
        relativeStart: 0,
        zoom: {
          start: 0,
          end: 0,
        },
      },
      forms: { all: {} },
    },
  };

  cloudwatchMock.on(GetMetricDataCommand).resolves({
    MetricDataResults: [
      {
        Id: 'm0',
        Values: [1, 2, 3],
      },
    ],
  });

  const response = await handler(event);

  expect(response).toEqual(`<h4>SomeTitle</h4>

<p>MyQueue</p><table>
<tr><th>Queue Name</th><th>Visible Messages</th><th>Action</th></tr>
<tr><td>bar</td><td>1</td><td><a class="btn " href="/sqs/v2/home#/queues/https%3A%2F%2Fsqs.undefined.amazonaws.com%2FXXXXXXXXXXXX%2FMyQueue">Goto Queue</a> <a class="btn btn-primary">ReDrive</a><cwdb-action action="call" display="widget" endpoint="arn:aws:lambda:us-east-2:123456789012:function:my-function" event="click"></<cwdb-action></td></tr>
</table>`);
});
