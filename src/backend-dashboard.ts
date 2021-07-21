import { createHash } from 'crypto';

import { Dashboard, MathExpression, GraphWidget, PeriodOverride, TextWidget, Metric } from '@aws-cdk/aws-cloudwatch';
import { IFunction } from '@aws-cdk/aws-lambda';
import { IStateMachine } from '@aws-cdk/aws-stepfunctions';
import { Construct, Duration } from '@aws-cdk/core';
import { Discovery } from './backend/discovery';
import { Ingestion } from './backend/ingestion';
import { Inventory } from './backend/inventory';
import { Orchestration } from './backend/orchestration';

export interface BackendDashboardProps {
  readonly discovery: Discovery;
  readonly ingestion: Ingestion;
  readonly orchestration: Orchestration;
  readonly inventory: Inventory;
}

export class BackendDashboard extends Construct {
  public constructor(scope: Construct, id: string, props: BackendDashboardProps) {
    super(scope, id);

    new Dashboard(this, 'Resource', {
      periodOverride: PeriodOverride.INHERIT,
      widgets: [
        [
          new TextWidget({
            height: 2,
            width: 24,
            markdown: '# Catalog Overview',
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
              props.inventory.metricMissingPythonDocsCount({ label: 'Missing Py-Docs' }),
              props.inventory.metricMissingTypeScriptDocsCount({ label: 'Missing Ts-Doc' }),
            ],
            leftYAxis: { min: 0 },
          }),
        ],
        [
          new TextWidget({
            height: 2,
            width: 24,
            markdown: [
              '# Discovery Function',
              '',
              `[Search Log Group](${lambdaSearchLogGroupUrl(props.discovery.function)})`,
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
            rightYAxis: { min: 0 },
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
              `[Search Log Group](${lambdaSearchLogGroupUrl(props.ingestion.function)})`,
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
            ],
            leftYAxis: { min: 0 },
            right: [
              fillMetric(props.ingestion.metricFoundLicenseFile({ label: 'Found License file' })),
            ],
            rightYAxis: { min: 0 },
          }),
        ],
        [
          new TextWidget({
            height: 2,
            width: 24,
            markdown:
              ['# Orchestration',
                '',
                `[State Machine](${stateMachineUrl(props.orchestration.stateMachine)})`].join('\n'),
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
      ],
    });
  }
}

function lambdaSearchLogGroupUrl(lambda: IFunction): string {
  return `/cloudwatch/home#logsV2:log-groups/log-group/$252Faws$252flambda$252f${lambda.functionName}/log-events`;
}

function stateMachineUrl(stateMachine: IStateMachine): string {
  return `/states/home#/statemachines/view/${stateMachine.stateMachineArn}`;
}

function fillMetric(metric: Metric, value: number | 'REPEAT' = 0): MathExpression {
  const h = createHash('sha256')
    .update(JSON.stringify(metric.toMetricConfig()))
    .digest('hex');
  const metricName = `m${h}`;
  return new MathExpression({
    expression: `FILL(${metricName}, ${value})`,
    label: metric.label,
    usingMetrics: { [metricName]: metric },
  });
}
