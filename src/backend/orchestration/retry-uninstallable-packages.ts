import { Duration } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import {
  IStateMachine,
  StateMachine,
  Succeed,
  Fail,
  Pass,
  Choice,
  Condition,
  Map,
  JsonPath,
  IntegrationPattern,
  TaskInput,
} from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { ReadUninstallableReport } from './read-uninstallable-report';

export interface RetryUninstallablePackagesProps {
  readonly bucket: IBucket;
  readonly orchestrationStateMachine: IStateMachine;
}

/**
 * State machine that retries processing of uninstallable packages.
 *
 * This workflow:
 * 1. Reads the uninstallable packages report
 * 2. Triggers main orchestration for each package
 * 3. Ends after processing all packages
 */
export class RetryUninstallablePackages extends Construct {
  public readonly stateMachine: StateMachine;

  public constructor(
    scope: Construct,
    id: string,
    props: RetryUninstallablePackagesProps
  ) {
    super(scope, id);

    const noReportFound = new Fail(this, 'No Report Found', {
      error: 'NoReportFound',
      cause:
        'Uninstallable packages report not found at uninstallable-objects/data.json',
    });

    const noPackagesToRetry = new Succeed(this, 'No Packages to Retry');

    const readReportFunction = new ReadUninstallableReport(
      this,
      'ReadReportFunction',
      {
        logRetention: RetentionDays.THREE_MONTHS,
      }
    );

    props.bucket.grantRead(readReportFunction);

    const readReport = new tasks.LambdaInvoke(
      this,
      'Read Uninstallable Report',
      {
        lambdaFunction: readReportFunction,
        payload: TaskInput.fromObject({
          bucket: props.bucket.bucketName,
          key: 'uninstallable-objects/data.json',
        }),
        resultPath: '$.reportResponse',
      }
    );

    readReport.addRetry({
      errors: ['Lambda.Unknown'],
      interval: Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2.0,
    });

    readReport.addCatch(noReportFound, {
      errors: ['States.TaskFailed'],
    });

    const packageRetryFailed = new Pass(this, 'Package Retry Failed', {
      parameters: {
        'package.$': '$.originalPackage',
        'prefix.$':
          "States.Format('data/{}/v{}', $.packageName, $.packageVersion)",
        'error.$': '$.error',
      },
    });

    const retryPackage = new tasks.StepFunctionsStartExecution(
      this,
      'Retry Package',
      {
        stateMachine: props.orchestrationStateMachine,
        integrationPattern: IntegrationPattern.RUN_JOB,
        input: TaskInput.fromObject({
          bucket: props.bucket.bucketName,
          assembly: {
            'key.$':
              "States.Format('data/{}/v{}/assembly.json', $.packageName, $.packageVersion)",
          },
          metadata: {
            'key.$':
              "States.Format('data/{}/v{}/metadata.json', $.packageName, $.packageVersion)",
          },
          package: {
            'key.$':
              "States.Format('data/{}/v{}/package.tgz', $.packageName, $.packageVersion)",
          },
        }),
      }
    );

    retryPackage.addRetry({
      errors: ['StepFunctions.ExecutionLimitExceeded'],
      interval: Duration.seconds(60),
      maxAttempts: 3,
      backoffRate: 2.0,
    });

    retryPackage.addCatch(packageRetryFailed, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    const processEachPackage = new Map(this, 'Process Each Package', {
      itemsPath: JsonPath.stringAt('$.reportResponse.Payload.packages'),
      resultPath: JsonPath.DISCARD,
    });

    processEachPackage.itemProcessor(retryPackage);

    const hasPackages = new Choice(this, 'Has Packages?')
      .when(
        Condition.isPresent('$.reportResponse.Payload.packages[0]'),
        processEachPackage
      )
      .otherwise(noPackagesToRetry);

    const definition = readReport.next(hasPackages);

    this.stateMachine = new StateMachine(this, 'Resource', {
      definition,
      stateMachineName: 'RetryUninstallablePackages',
      timeout: Duration.hours(6),
      tracingEnabled: true,
    });

    props.bucket.grantRead(this.stateMachine);
    props.orchestrationStateMachine.grantStartExecution(this.stateMachine);
  }
}
