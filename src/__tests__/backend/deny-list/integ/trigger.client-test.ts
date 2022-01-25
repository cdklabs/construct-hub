// undefined
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from '@aws-cdk/core';
import { AfterCreate } from 'cdk-triggers';

export interface TriggerClientTestProps extends lambda.FunctionOptions {
  /**
   * Trigger this handler after these constructs were deployed.
   * @default - trigger this handler after all implicit dependencies have been created
   */
  readonly invokeAfter?: Construct[];
}

export class TriggerClientTest extends lambda.Function {
  constructor(scope: Construct, id: string, props?: TriggerClientTestProps) {
    super(scope, id, {
      description: '__tests__/backend/deny-list/integ/trigger.client-test.lambda.ts',
      ...props,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/trigger.client-test.lambda.bundle')),
    });

    new AfterCreate(this, 'Trigger', {
      handler: this,
      resources: props?.invokeAfter,
    });
  }
}