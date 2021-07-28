import { createHash } from 'crypto';

import { Dashboard, MathExpression, GraphWidget, GraphWidgetView, PeriodOverride, TextWidget, Metric, IWidget } from '@aws-cdk/aws-cloudwatch';
import { IFunction } from '@aws-cdk/aws-lambda';
import { IBucket } from '@aws-cdk/aws-s3';
import { IQueue } from '@aws-cdk/aws-sqs';
import { IStateMachine } from '@aws-cdk/aws-stepfunctions';
import { Construct, Duration, Stack } from '@aws-cdk/core';
import { DenyList } from './backend/deny-list';
import { Discovery } from './backend/discovery';
import { Ingestion } from './backend/ingestion';
import { Inventory } from './backend/inventory';
import { Orchestration } from './backend/orchestration';
import { DocumentationLanguage } from './backend/shared/language';

export interface BackendDashboardProps {
  readonly dashboardName?: string;
  readonly discovery: Discovery;
  readonly ingestion: Ingestion;
  readonly orchestration: Orchestration;
  readonly inventory: Inventory;
  readonly denyList: DenyList;
  readonly packageData: IBucket;
}

export class BackendDashboard extends Construct {
  public constructor(scope: Construct, id: string, props: BackendDashboardProps) {
    super(scope, id);

    new Dashboard(this, 'Resource', {
      dashboardName: props.dashboardName,
      periodOverride: PeriodOverride.INHERIT,
      widgets: [
        [
          new TextWidget({
            height: 2,
            width: 24,
            markdown: [
              '# Catalog Overview',
              '',
              `[button:Package Data](${s3ObjectUrl(props.packageData)})`,
              `[button:Catalog Builder](${lambdaFunctionUrl(props.orchestration.catalogBuilder)})`,
            ].join('\n'),
          }),
        ],
        [
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Catalog Size',
            left: [
              props.inventory.metricSubmoduleCount({ label: 'Submodules' }),
              props.inventory.metricPackageVersionCount({ label: 'Package Versions' }),
              props.inventory.metricPackageMajorCount({ label: 'Package Majors' }),
              props.inventory.metricPackageCount({ label: 'Packages' }),
            ],
            leftYAxis: { min: 0 },
          }),
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Catalog Issues',
            left: [
              props.inventory.metricUnknownObjectCount({ label: 'Unknown' }),
              props.inventory.metricMissingAssemblyCount({ label: 'Missing Assembly' }),
              props.inventory.metricMissingPackageMetadataCount({ label: 'Missing Metadata' }),
              props.inventory.metricMissingPackageTarballCount({ label: 'Missing Tarball' }),
            ],
            leftYAxis: { min: 0 },
          }),
        ],
        ...this.catalogOverviewLanguageSections(props.inventory),
        [
          new TextWidget({
            height: 2,
            width: 24,
            markdown: [
              '# Discovery Function',
              '',
              `[button:Search Log Group](${lambdaSearchLogGroupUrl(props.discovery.function)})`,
            ].join('\n'),
          }),
        ],
        [
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Function Health',
            left: [
              fillMetric(props.discovery.function.metricInvocations({ label: 'Invocations' })),
              fillMetric(props.discovery.function.metricErrors({ label: 'Errors' })),
            ],
            leftYAxis: { min: 0 },
            right: [
              props.discovery.metricRemainingTime({ label: 'Remaining Time' }),
            ],
            rightYAxis: { min: 0 },
            period: Duration.minutes(15),
          }),
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'CouchDB Follower',
            left: [
              props.discovery.metricChangeCount({ label: 'Change Count' }),
              props.discovery.metricUnprocessableEntity({ label: 'Unprocessable' }),
            ],
            leftYAxis: { min: 0 },
            right: [
              fillMetric(props.discovery.metricNpmJsChangeAge({ label: 'Lag to npmjs.com' }), 'REPEAT'),
              fillMetric(props.discovery.metricPackageVersionAge({ label: 'Package Version Age' }), 'REPEAT'),
            ],
            rightYAxis: { label: 'Milliseconds', min: 0, showUnits: false },
            period: Duration.minutes(15),
          }),
        ],
        [
          new TextWidget({
            height: 2,
            width: 24,
            markdown: [
              '# Ingestion Function',
              '',
              `[button:Search Log Group](${lambdaSearchLogGroupUrl(props.ingestion.function)})`,
              `[button:DLQ](${sqsQueueUrl(props.ingestion.deadLetterQueue)})`,
            ].join('\n'),
          }),
        ],
        [
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Function Health',
            left: [
              fillMetric(props.ingestion.function.metricInvocations({ label: 'Invocations' })),
              fillMetric(props.ingestion.function.metricErrors({ label: 'Errors' })),
            ],
            leftYAxis: { min: 0 },
            period: Duration.minutes(1),
          }),
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Input Queue',
            left: [
              props.ingestion.queue.metricApproximateNumberOfMessagesVisible({ label: 'Visible Messages', period: Duration.minutes(1) }),
              props.ingestion.queue.metricApproximateNumberOfMessagesNotVisible({ label: 'Hidden Messages', period: Duration.minutes(1) }),
            ],
            leftYAxis: { min: 0 },
            right: [
              props.ingestion.queue.metricApproximateAgeOfOldestMessage({ label: 'Oldest Message Age', period: Duration.minutes(1) }),
            ],
            rightAnnotations: [{
              color: '#ffa500',
              label: '10 Minutes',
              value: Duration.minutes(10).toSeconds(),
            }],
            rightYAxis: { min: 0 },
            period: Duration.minutes(1),
          }),
        ],
        [
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Input Quality',
            left: [
              fillMetric(props.ingestion.metricInvalidAssembly({ label: 'Invalid Assemblies' })),
              fillMetric(props.ingestion.metricInvalidTarball({ label: 'Invalid Tarball' })),
              fillMetric(props.ingestion.metricIneligibleLicense({ label: 'Ineligible License' })),
              fillMetric(props.ingestion.metricMismatchedIdentityRejections({ label: 'Mismatched Identity' })),
              fillMetric(props.ingestion.metricFoundLicenseFile({ label: 'Found License file' })),
            ],
            leftYAxis: { label: 'Count', min: 0, showUnits: false },
            stacked: true,
          }),
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Dead Letters',
            left: [
              props.ingestion.deadLetterQueue.metricApproximateNumberOfMessagesVisible({ label: 'Visible Messages' }),
              props.ingestion.deadLetterQueue.metricApproximateNumberOfMessagesNotVisible({ label: 'Invisible Messages' }),
            ],
            leftYAxis: { min: 0 },
            right: [
              props.ingestion.deadLetterQueue.metricApproximateAgeOfOldestMessage({ label: 'Oldest Message Age' }),
            ],
            rightYAxis: { min: 0 },
            period: Duration.minutes(1),
          }),
        ],
        [
          new TextWidget({
            height: 2,
            width: 24,
            markdown:
              [
                '# Orchestration',
                '',
                `[button:State Machine](${stateMachineUrl(props.orchestration.stateMachine)})`,
                `[button:DLQ](${sqsQueueUrl(props.orchestration.deadLetterQueue)})`,
                `[button:Redrive DLQ](${lambdaFunctionUrl(props.orchestration.redriveFunction)})`,
                `[button:Reprocess](${lambdaFunctionUrl(props.orchestration.reprocessAllFunction)})`,
              ].join('\n'),
          }),
        ],
        [
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'State Machine Executions',
            left: [
              fillMetric(props.orchestration.stateMachine.metricStarted({ label: 'Started' })),
              fillMetric(props.orchestration.stateMachine.metricSucceeded({ label: 'Succeeded' })),
              fillMetric(props.orchestration.stateMachine.metricAborted({ label: 'Aborted' })),
              fillMetric(props.orchestration.stateMachine.metricFailed({ label: 'Failed' })),
              fillMetric(props.orchestration.stateMachine.metricThrottled({ label: 'Throttled' })),
              fillMetric(props.orchestration.stateMachine.metricTimedOut({ label: 'Timed Out' })),
            ],
            leftYAxis: { min: 0 },
            right: [
              props.orchestration.stateMachine.metricTime({ label: 'Duration' }),
            ],
            rightYAxis: { min: 0 },
          }),
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Dead Letter Queue',
            left: [
              props.orchestration.deadLetterQueue.metricApproximateNumberOfMessagesVisible({ label: 'Visible Messages' }),
              props.orchestration.deadLetterQueue.metricApproximateNumberOfMessagesNotVisible({ label: 'Invisible Messages' }),
            ],
            leftYAxis: { min: 0 },
            right: [
              props.orchestration.deadLetterQueue.metricApproximateAgeOfOldestMessage({ label: 'Oldest Message Age' }),
            ],
            rightYAxis: { min: 0 },
            period: Duration.minutes(1),
          }),
        ],


        // deny list
        // ----------------------------------------------
        [
          new TextWidget({
            height: 2,
            width: 24,
            markdown:
              [
                '# Deny List',
                '',
                `[button:Deny List Object](${s3ObjectUrl(props.denyList.bucket, props.denyList.objectKey)})`,
                `[button:Prune Function](${lambdaFunctionUrl(props.denyList.prune.handler)})`,
                `[button:Prune Logs](${lambdaSearchLogGroupUrl(props.denyList.prune.handler)})`,
                `[button:Delete Queue](${sqsQueueUrl(props.denyList.prune.queue)})`,
                `[button:Delete Logs](${lambdaSearchLogGroupUrl(props.denyList.prune.deleteHandler)})`,
              ].join('\n'),
          }),
        ],
        [
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Deny List',
            left: [
              fillMetric(props.denyList.metricDenyListRules({ label: 'Rules' }), 'REPEAT'),
              props.denyList.prune.queue.metricNumberOfMessagesDeleted({ label: 'Deleted Files' }),
            ],
            leftYAxis: { min: 0 },
            period: Duration.minutes(5),
          }),
          new GraphWidget({
            height: 6,
            width: 12,
            title: 'Prune Function Health',
            left: [
              fillMetric(props.denyList.prune.handler.metricInvocations({ label: 'Invocations' })),
              fillMetric(props.denyList.prune.handler.metricErrors({ label: 'Errors' })),
            ],
            leftYAxis: { min: 0 },
            period: Duration.minutes(5),
          }),
        ],

      ],
    });
  }

  private *catalogOverviewLanguageSections(inventory: Inventory): Generator<IWidget[]> {
    yield [
      new TextWidget({
        height: 2,
        width: 24,
        markdown: '# Documentation Generation',
      }),
    ];
    for (const language of DocumentationLanguage.ALL) {
      yield [
        new TextWidget({
          height: 1,
          width: 24,
          markdown: `## Language: ${language.toString()}`,
        }),
      ];
      yield [
        new GraphWidget({
          height: 6,
          width: 6,
          title: 'Package Versions',
          left: [
            inventory.metricSupportedPackageVersionCount(language, { label: 'Available', color: '#2ca02c' }),
            inventory.metricUnsupportedPackageVersionCount(language, { label: 'Unsupported', color: '#9467bd' }),
            inventory.metricMissingPackageVersionCount(language, { label: 'Missing', color: '#d62728' }),
          ],
          leftYAxis: { showUnits: false },
          view: GraphWidgetView.PIE,
        }),
        new GraphWidget({
          height: 6,
          width: 6,
          title: 'Package Versions',
          left: [
            inventory.metricSupportedPackageVersionCount(language, { label: 'Available', color: '#2ca02c' }),
            inventory.metricUnsupportedPackageVersionCount(language, { label: 'Unsupported', color: '#9467bd' }),
            inventory.metricMissingPackageVersionCount(language, { label: 'Missing', color: '#d62728' }),
          ],
          leftYAxis: { showUnits: false },
          stacked: true,
        }),
        new GraphWidget({
          height: 6,
          width: 6,
          title: 'Package Version Submodules',
          left: [
            inventory.metricSupportedSubmoduleCount(language, { label: 'Available', color: '#2ca02c' }),
            inventory.metricUnsupportedSubmoduleCount(language, { label: 'Unsupported', color: '#9467bd' }),
            inventory.metricMissingSubmoduleCount(language, { label: 'Missing', color: '#d62728' }),
          ],
          leftYAxis: { showUnits: false },
          view: GraphWidgetView.PIE,
        }),
        new GraphWidget({
          height: 6,
          width: 6,
          title: 'Package Version Submodules',
          left: [
            inventory.metricSupportedSubmoduleCount(language, { label: 'Available', color: '#2ca02c' }),
            inventory.metricUnsupportedSubmoduleCount(language, { label: 'Unsupported', color: '#9467bd' }),
            inventory.metricMissingSubmoduleCount(language, { label: 'Missing', color: '#d62728' }),
          ],
          leftYAxis: { showUnits: false },
          stacked: true,
        }),
      ];
    }
  }
}

function lambdaFunctionUrl(lambda: IFunction): string {
  return `/lambda/home#/functions/${lambda.functionName}`;
}

function lambdaSearchLogGroupUrl(lambda: IFunction): string {
  return `/cloudwatch/home#logsV2:log-groups/log-group/$252Faws$252flambda$252f${lambda.functionName}/log-events`;
}

function stateMachineUrl(stateMachine: IStateMachine): string {
  return `/states/home#/statemachines/view/${stateMachine.stateMachineArn}`;
}

function sqsQueueUrl(queue: IQueue): string {
  const stack = Stack.of(queue);
  // We can't use the Queue URL as-is, because we can't "easily" URL-encode it in CFN...
  return `/sqs/v2/home#/queues/https%3A%2F%2Fsqs.${stack.region}.amazonaws.com%2F${stack.account}%2F${queue.queueName}`;
}

function s3ObjectUrl(bucket: IBucket, objectKey?: string): string {
  if (objectKey) {
    return `/s3/object/${bucket.bucketName}?prefix=${objectKey}`;
  } else {
    return `/s3/buckets/${bucket.bucketName}`;
  }
}

function fillMetric(metric: Metric, value: number | 'REPEAT' = 0): MathExpression {
  // We assume namespace + name is enough to uniquely identify a metric here.
  // This is true locally at this time, but in case this ever changes, consider
  // also processing dimensions and period.
  const h = createHash('sha256')
    .update(metric.namespace)
    .update('\0')
    .update(metric.metricName)
    .digest('hex');
  const metricName = `m${h}`;
  return new MathExpression({
    expression: `FILL(${metricName}, ${value})`,
    label: metric.label,
    usingMetrics: { [metricName]: metric },
  });
}
