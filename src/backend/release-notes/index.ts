import * as cdk from 'aws-cdk-lib';
import {
  Alarm,
  ComparisonOperator,
  MathExpression,
  Metric,
  MetricOptions,
  Statistic,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { IQueue } from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { JsonPath } from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { stateMachineUrl, lambdaFunctionUrl } from '../../deep-link';
import { Monitoring } from '../../monitoring';
import { OverviewDashboard } from '../../overview-dashboard';
import { RUNBOOK_URL } from '../../runbook-url';
import { FeedBuilder } from '../feed-builder';
import {
  PACKAGE_KEY_SUFFIX,
  STORAGE_KEY_PREFIX,
  PACKAGE_RELEASE_NOTES_KEY_SUFFIX,
} from '../shared/constants';

import * as metricConst from './constants';

import { GenerateReleaseNotes } from './generate-release-notes';
import { GetMessagesFromWorkerQueue } from './get-messages-from-worker-queue';
import { ReleaseNotesTrigger } from './release-notes-trigger';

/**
 * Properties for ReleaseNoteFetcher.
 */
export interface ReleaseNoteFetcherProps {
  /**
   * The package data storage bucket, where release-notes.md will be stored along with other assets
   */
  readonly bucket: s3.IBucket;

  /**
   * GitHub credential used to when making request to GitHub API to retrieve changelogs.
   * @default - do not fetch changelogs from GitHub
   */
  readonly gitHubCredentialsSecret?: ISecret;

  /**
   * The monitoring handler to register alarms with.
   */
  readonly monitoring: Monitoring;

  /**
   * The overview dashboard to register dashboards with.
   */
  readonly overviewDashboard: OverviewDashboard;

  /**
   * The lambda function that updates the RSS/ATOM feed
   */
  readonly feedBuilder: FeedBuilder;
}

/**
 * Creates a StepFunction which will generate change-log file for the packages that are added
 * to the ReleaseNoteFetcher Queue. To generate the release notes, the fetcher pulls data from
 * GitHub (release tag, releases and changelog.md file). When the GitHub credentials are passed,
 * the fetcher respects service rate limits of GitHub by pausing the generation of release notes
 */
export class ReleaseNoteFetcher extends Construct {
  /**
   * The queue where packages where the packages will be added to generate release notes
   */
  public readonly queue: IQueue;
  private readonly bucket: s3.IBucket;
  private readonly githubTokenSecret?: ISecret;
  /**
   * Lambda function that update the RSS/Atom feed
   */
  public readonly updateFeedFunction: lambda.Function;
  public readonly workerQueue: IQueue;
  public readonly workerDLQ: IQueue;

  public readonly stateMachine: sfn.IStateMachine;
  public readonly releaseNotesTriggerLambda: ReleaseNotesTrigger;
  public readonly generateReleaseNotesLambda: GenerateReleaseNotes;

  constructor(scope: Construct, id: string, props: ReleaseNoteFetcherProps) {
    super(scope, id);
    this.bucket = props.bucket;
    this.githubTokenSecret = props.gitHubCredentialsSecret;
    this.updateFeedFunction = props.feedBuilder.updateFeedFunction;

    const stateMachineName = stateMachineNameFrom(this.node.path);
    // The state machine will re-run itself after fetching a release notes
    // for a few APIs. For the state machine to self execute ARN needs
    // to be predictable
    const stateMachineArn = cdk.Stack.of(this).formatArn({
      arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
      service: 'states',
      resource: 'stateMachine',
      resourceName: stateMachineName,
    });

    this.workerDLQ = new sqs.Queue(this, 'ReleaseNotesFetchWorkerQueueDLQ', {
      visibilityTimeout: cdk.Duration.seconds(300),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    props.overviewDashboard.addDLQMetricToDashboard(
      'ReleaseNotesWorkerDLQ',
      this.workerDLQ
    );

    // worker queue is the queue from which step function will retrieve messages from
    this.workerQueue = new sqs.Queue(this, 'ReleaseNotesFetchWorkerQueue', {
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: {
        maxReceiveCount: 10,
        queue: this.workerDLQ,
      },
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    // Fetch queue is where job gets added, and a lambda function
    // checks and see if StateMachine is running and if it is not then
    // kicks off the state machine after adding the job to worker queue
    this.queue = new sqs.Queue(this, 'ChangeLogFetchQueue', {
      queueName: 'ChangeLogFetchQueue',
      visibilityTimeout: cdk.Duration.seconds(300),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    this.releaseNotesTriggerLambda = new ReleaseNotesTrigger(
      this,
      'ReleaseNotesTrigger',
      {
        environment: {
          SFN_ARN: stateMachineArn,
          WORKER_QUEUE_URL: this.workerQueue.queueUrl,
        },
        timeout: cdk.Duration.minutes(1),
      }
    );

    props.overviewDashboard.addConcurrentExecutionMetricToDashboard(
      this.releaseNotesTriggerLambda,
      'releaseNotesTrigger'
    );

    this.workerQueue.grantSendMessages(this.releaseNotesTriggerLambda);
    this.releaseNotesTriggerLambda.grantPrincipal.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['states:ListExecutions', 'states:StartExecution'],
        effect: iam.Effect.ALLOW,
        resources: [stateMachineArn],
      })
    );

    const eventSource = new SqsEventSource(this.queue);
    this.releaseNotesTriggerLambda.addEventSource(eventSource);

    this.generateReleaseNotesLambda = new GenerateReleaseNotes(
      this,
      'GithubChangelogFetcher',
      {
        description: 'ReleaseNotes generator',
        environment: {
          ...(this.githubTokenSecret
            ? { GITHUB_TOKEN: this.githubTokenSecret.secretValue.toString() }
            : {}),
          BUCKET_NAME: this.bucket.bucketName,
        },
        timeout: cdk.Duration.minutes(10),
        memorySize: 1024,
      }
    );
    props.overviewDashboard.addConcurrentExecutionMetricToDashboard(
      this.generateReleaseNotesLambda,
      'releaseNoteGenerateForPackage'
    );

    const restartExecution = new tasks.StepFunctionsStartExecution(
      this,
      'Continue as new',
      {
        associateWithParent: true,
        stateMachine: sfn.StateMachine.fromStateMachineArn(
          this,
          'ThisStateMachine',
          stateMachineArn
        ),
        integrationPattern: sfn.IntegrationPattern.REQUEST_RESPONSE,
        resultPath: JsonPath.DISCARD,
      }
    )
      .addRetry({ errors: ['StepFunctions.ExecutionLimitExceeded'] })
      .next(new sfn.Succeed(this, 'done', { comment: 'New instance started' }));

    const getTasksFromWorkerQueue = new GetMessagesFromWorkerQueue(
      this,
      'ReleaseNoteTasks',
      {
        description: 'ReleaseNotes get message from the worker queue',

        environment: {
          ...(this.githubTokenSecret
            ? { GITHUB_TOKEN: this.githubTokenSecret.secretValue.toString() }
            : {}),
          SQS_QUEUE_URL: this.workerQueue.queueUrl,
        },
        timeout: cdk.Duration.minutes(5),
      }
    );

    this.bucket.grantRead(
      this.generateReleaseNotesLambda,
      `${STORAGE_KEY_PREFIX}*${PACKAGE_KEY_SUFFIX}`
    );
    this.bucket.grantReadWrite(
      this.generateReleaseNotesLambda,
      `${STORAGE_KEY_PREFIX}*${PACKAGE_RELEASE_NOTES_KEY_SUFFIX}`
    );

    const generateReleaseNotesForEachPackage = new tasks.LambdaInvoke(
      this,
      'Generate Release notes for a package',
      {
        lambdaFunction: this.generateReleaseNotesLambda,
        payloadResponseOnly: true,
        inputPath: '$.Body',
        resultPath: '$.result',
      }
    ).next(
      new sfn.Choice(this, 'With result')
        .when(
          sfn.Condition.stringEquals('$.result.error', 'RequestQuotaExhausted'),
          new tasks.CallAwsService(
            this,
            'Make the message visible again for next iteration',
            {
              service: 'sqs',
              comment:
                'Make the message visible again so next iteration will consume it',
              action: 'changeMessageVisibility',
              iamResources: [this.workerQueue.queueArn],
              parameters: {
                QueueUrl: this.workerQueue.queueUrl,
                ReceiptHandle: JsonPath.stringAt('$.ReceiptHandle'),
                VisibilityTimeout: 0,
              },
              resultPath: '$.errorHandler',
            }
          )
        )
        .when(
          sfn.Condition.stringEquals('$.result.error', 'InvalidCredentials'),
          new tasks.CallAwsService(
            this,
            'Send message to DLQ when credentials are invalid',
            {
              service: 'sqs',
              comment:
                'Github credentials passed is invalid. Retrying wont help. Moving to DLQ',
              action: 'sendMessage',
              iamResources: [this.workerDLQ.queueArn],
              parameters: {
                QueueUrl: this.workerDLQ.queueUrl,
                MessageBody: JsonPath.jsonToString(JsonPath.stringAt('$.Body')),
              },
              resultPath: '$.errorHandler',
            }
          ).next(
            new tasks.CallAwsService(
              this,
              'remove the message from SQS after sending to DLQ',
              {
                service: 'sqs',
                action: 'deleteMessage',
                iamResources: [this.workerQueue.queueArn],
                parameters: {
                  QueueUrl: this.workerQueue.queueUrl,
                  ReceiptHandle: JsonPath.stringAt('$.ReceiptHandle'),
                },
                resultPath: '$.errorHandler',
              }
            )
          )
        )
        .otherwise(
          new tasks.CallAwsService(this, 'remove the message from SQS', {
            service: 'sqs',
            action: 'deleteMessage',
            iamResources: [this.workerQueue.queueArn],
            parameters: {
              QueueUrl: this.workerQueue.queueUrl,
              ReceiptHandle: JsonPath.stringAt('$.ReceiptHandle'),
            },
            resultPath: '$.cleanup',
          })
        )
    );

    const updateFeedTaskWhenWaitingForGHRateLimit = new tasks.LambdaInvoke(
      this,
      'updateFeedTaskWhenWaitingForGHRateLimit',
      {
        lambdaFunction: this.updateFeedFunction,
        comment: 'Update the RSS/Atom feed',
      }
    );

    const updateFeedAfterProcessing = new tasks.LambdaInvoke(
      this,
      'updateFeedAfterProcessing',
      {
        lambdaFunction: this.updateFeedFunction,
        comment:
          'Update the RSS/Atom feed after processing all the items in the queue',
      }
    );

    const getTasksFromQueue = new tasks.LambdaInvoke(
      this,
      'check service quota and get tasks from worker queue',
      {
        lambdaFunction: getTasksFromWorkerQueue,
        payloadResponseOnly: true,
      }
    ).next(
      new sfn.Choice(this, 'with result')
        .when(
          sfn.Condition.isPresent('$.waitUntil'),
          new sfn.Parallel(this, 'wait and update')
            .branch(
              new sfn.Wait(this, 'wait till service quota replenishes', {
                time: sfn.WaitTime.timestampPath('$.waitUntil'),
              }),
              updateFeedTaskWhenWaitingForGHRateLimit
            )
            .next(restartExecution)
        )
        .when(
          sfn.Condition.isPresent('$.error.MaxConcurrentExecutionError'),
          new sfn.Succeed(
            this,
            'Stopping this execution since Max concurrent execution has reached'
          )
        )
        .when(
          sfn.Condition.isPresent('$.messages'),
          new sfn.Map(this, 'with each package', {
            comment: 'Fetch release notes for each package',
            itemsPath: '$.messages',
          }).iterator(generateReleaseNotesForEachPackage)
        )
        .otherwise(
          updateFeedAfterProcessing.next(new sfn.Succeed(this, 'all done'))
        )
        .afterwards()
        .next(restartExecution)
    );

    this.stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definition: getTasksFromQueue,
      stateMachineName,
      timeout: cdk.Duration.days(1),
      tracingEnabled: true,
    });

    getTasksFromWorkerQueue.addEnvironment(
      'STEP_FUNCTION_ARN',
      stateMachineArn
    );

    getTasksFromWorkerQueue.grantPrincipal.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['states:ListExecutions'],
        effect: iam.Effect.ALLOW,
        resources: [stateMachineArn],
      })
    );
    this.workerQueue.grantConsumeMessages(getTasksFromWorkerQueue);

    props.monitoring.addHighSeverityAlarm(
      'ReleaseNotes generation Failure',
      this.stateMachine
        .metricFailed()
        .createAlarm(this, 'ReleaseNotesGenerationFailure', {
          alarmName: `${this.stateMachine.node.path} / Failure`,
          alarmDescription: [
            'Release notes generation step function is failing!',
            '',
            `RunBook: ${RUNBOOK_URL}`,
            '',
            `Direct link to the function: ${stateMachineUrl(
              this.stateMachine
            )}`,
          ].join('\n'),
          comparisonOperator:
            ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          evaluationPeriods: 2,
          threshold: 1,
          treatMissingData: TreatMissingData.NOT_BREACHING,
        })
    );

    props.monitoring.addLowSeverityAlarm(
      'ReleaseNotes trigger failure',
      this.releaseNotesTriggerLambda
        .metricErrors()
        .createAlarm(this, 'ReleaseNotesTriggerFailure', {
          alarmName: `${this.releaseNotesTriggerLambda.node.path} / Failure`,
          alarmDescription: [
            'Release notes generation trigger function is failing!',
            '',
            `RunBook: ${RUNBOOK_URL}`,
            '',
            `Direct link to the function: ${lambdaFunctionUrl(
              this.releaseNotesTriggerLambda
            )}`,
          ].join('\n'),
          comparisonOperator:
            ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          evaluationPeriods: 2,
          threshold: 1,
          treatMissingData: TreatMissingData.NOT_BREACHING,
        })
    );

    props.monitoring.addLowSeverityAlarm(
      'Github rate limit',
      this.generateGithubRateLimitAlarm()
    );

    props.monitoring.addHighSeverityAlarm(
      'ReleaseNotes Github credential invalid',
      this.metricInvalidCredentials().createAlarm(
        this,
        'ReleaseNotesInvalidGitHubCredentials',
        {
          alarmName: `${this.node.path}/ ReleaseNotes / Invalid GitHub credential`,
          alarmDescription: [
            'Release notes generation is failing due to Invalid GitHub token',
            '',
            `RunBook: ${RUNBOOK_URL}`,
            '',
          ].join('\n'),
          comparisonOperator:
            ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          evaluationPeriods: 2,
          threshold: 1,
          treatMissingData: TreatMissingData.NOT_BREACHING,
        }
      )
    );
  }

  public metricPackagesWithReleaseNotesCount(opts?: MetricOptions): Metric {
    return new Metric({
      period: cdk.Duration.minutes(5),
      statistic: Statistic.SUM,
      ...opts,
      metricName: metricConst.PackageWithChangeLog,
      namespace: metricConst.METRICS_NAMESPACE,
    });
  }

  public metricInvalidCredentials(opts?: MetricOptions): Metric {
    return new Metric({
      period: cdk.Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: metricConst.InvalidCredentials,
      namespace: metricConst.METRICS_NAMESPACE,
    });
  }

  public metricRequestQuotaExhausted(opts?: MetricOptions): Metric {
    return new Metric({
      period: cdk.Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: metricConst.RequestQuotaExhausted,
      namespace: metricConst.METRICS_NAMESPACE,
    });
  }

  public metricRequestUnknownError(opts?: MetricOptions): Metric {
    return new Metric({
      period: cdk.Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: metricConst.UnknownError,
      namespace: metricConst.METRICS_NAMESPACE,
    });
  }

  public metricRequestUnSupportedRepo(opts?: MetricOptions): Metric {
    return new Metric({
      period: cdk.Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: metricConst.UnSupportedRepo,
      namespace: metricConst.METRICS_NAMESPACE,
    });
  }

  public metricRequestInvalidPackageJson(opts?: MetricOptions): Metric {
    return new Metric({
      period: cdk.Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: metricConst.InvalidPackageJson,
      namespace: metricConst.METRICS_NAMESPACE,
    });
  }

  public metricChangeLogFetchError(opts?: MetricOptions): Metric {
    return new Metric({
      period: cdk.Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: metricConst.ChangelogFetchError,
      namespace: metricConst.METRICS_NAMESPACE,
    });
  }

  public metricChangeLogAllError(opts?: MetricOptions): Metric {
    return new Metric({
      period: cdk.Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: metricConst.AllErrors,
      namespace: metricConst.METRICS_NAMESPACE,
    });
  }

  public metricGhRateLimitRemaining(opts?: MetricOptions): Metric {
    return new Metric({
      period: cdk.Duration.minutes(5),
      statistic: Statistic.MINIMUM,
      ...opts,
      metricName: metricConst.GhRateLimitsRemaining,
      namespace: metricConst.METRICS_NAMESPACE,
    });
  }

  public metricGhRateLimitUsed(opts?: MetricOptions): Metric {
    return new Metric({
      period: cdk.Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: metricConst.GhLimitsUsed,
      namespace: metricConst.METRICS_NAMESPACE,
    });
  }

  public metricGhRateLimitLimit(opts?: MetricOptions): Metric {
    return new Metric({
      period: cdk.Duration.minutes(5),
      statistic: Statistic.MAXIMUM,
      ...opts,
      metricName: metricConst.GhLimitsLimit,
      namespace: metricConst.METRICS_NAMESPACE,
    });
  }

  private generateGithubRateLimitAlarm(threshold: number = 80): Alarm {
    const percentUsed = new MathExpression({
      expression: '100 * rateLimitUsed / rateLimitLimit',
      label: 'GHT Rate limit Percent Used',
      usingMetrics: {
        rateLimitUsed: this.metricGhRateLimitUsed(),
        rateLimitLimit: this.metricGhRateLimitLimit(),
      },
    });

    return percentUsed.createAlarm(this, 'ReleaseNotes Github rate limit', {
      alarmName: `${this.node.path} / Github Rate Limit`,
      alarmDescription: [
        'Release notes generation is nearing the GitHub rate limit!',
        '',
        `RunBook: ${RUNBOOK_URL}`,
        '',
        `Consider either using GitHub application.`,
      ].join('\n'),
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 2,
      threshold,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
  }
}

function stateMachineNameFrom(nodePath: string): string {
  // Poor man's replace all...
  return nodePath.split(/[^a-z0-9+!@.()=_'-]+/i).join('.');
}
