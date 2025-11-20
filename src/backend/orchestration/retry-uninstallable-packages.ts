import { Duration } from 'aws-cdk-lib';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import {
  Choice,
  Condition,
  IntegrationPattern,
  IStateMachine,
  JsonPath,
  Map,
  Pass,
  StateMachine,
  Succeed,
  TaskInput,
} from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { UNINSTALLABLE_PACKAGES_REPORT } from '../shared/constants';

export interface RetryUninstallablePackagesProps {
  readonly bucket: IBucket;
  readonly reprocessStateMachine: IStateMachine;
  readonly inventoryFunction: tasks.LambdaInvoke;
}

/**
 * State machine that retries processing of uninstallable packages.
 *
 * This workflow:
 * 1. Reads the uninstallable packages report
 * 2. Triggers ReprocessDocumentationPerPackage for each entry
 * 3. Re-runs the inventory canary to update the report
 */
export class RetryUninstallablePackages extends Construct {
  public readonly stateMachine: StateMachine;

  public constructor(
    scope: Construct,
    id: string,
    props: RetryUninstallablePackagesProps
  ) {
    super(scope, id);

    // Read the uninstallable packages report
    const readReport = new tasks.CallAwsService(
      this,
      'Read Uninstallable Report',
      {
        service: 's3',
        action: 'getObject',
        iamAction: 's3:GetObject',
        iamResources: [
          `${props.bucket.bucketArn}/${UNINSTALLABLE_PACKAGES_REPORT}`,
        ],
        parameters: {
          Bucket: props.bucket.bucketName,
          Key: UNINSTALLABLE_PACKAGES_REPORT,
        },
        resultPath: '$.reportResponse',
      }
    )
      .addRetry({ errors: ['S3.NoSuchKey'] })
      .addCatch(new Succeed(this, 'No Report Found'), {
        errors: ['S3.NoSuchKey'],
      });

    // Parse the JSON content using intrinsic function
    const parseReport = new Pass(this, 'Parse Report', {
      parameters: {
        'packages.$': 'States.StringToJson($.reportResponse.Body)',
      },
      resultPath: '$.parsedReport',
    });

    // Transform package@version to data/package/v{version} format
    const transformPackage = new Pass(this, 'Transform Package Format', {
      parameters: {
        'prefix.$':
          'States.Format("data/{}/v{}", States.ArrayGetItem(States.StringSplit($, "@"), 0), States.ArrayGetItem(States.StringSplit($, "@"), 1))',
      },
      resultPath: '$.transformed',
    });

    // Process each uninstallable package
    const processPackages = new Map(this, 'Process Each Package', {
      itemsPath: '$.parsedReport.packages',
      resultPath: JsonPath.DISCARD,
    }).iterator(
      transformPackage.next(
        new tasks.StepFunctionsStartExecution(this, 'Retry Package', {
          stateMachine: props.reprocessStateMachine,
          input: TaskInput.fromObject({
            Prefix: JsonPath.stringAt('$.transformed.prefix'),
          }),
          integrationPattern: IntegrationPattern.RUN_JOB,
        })
          .addRetry({ errors: ['StepFunctions.ExecutionLimitExceeded'] })
          .addCatch(new Succeed(this, 'Package Retry Failed'), {
            errors: ['States.TaskFailed'],
          })
      )
    );

    // Re-run inventory canary to update the report
    const updateInventory = props.inventoryFunction.addRetry({
      errors: ['Lambda.TooManyRequestsException'],
    });

    const definition = readReport
      .next(parseReport)
      .next(
        new Choice(this, 'Has Packages?')
          .when(
            Condition.isPresent('$.parsedReport.packages[0]'),
            processPackages.next(updateInventory)
          )
          .otherwise(new Succeed(this, 'No Packages to Retry'))
      );

    this.stateMachine = new StateMachine(this, 'Resource', {
      definition,
      stateMachineName: 'RetryUninstallablePackages',
      timeout: Duration.hours(6),
      tracingEnabled: true,
    });

    props.bucket.grantRead(this.stateMachine);
  }
}
