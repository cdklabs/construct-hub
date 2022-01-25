// undefined
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from '@aws-cdk/core';

export interface RedriveStateMachineProps extends lambda.FunctionOptions {
}

export class RedriveStateMachine extends lambda.Function {
  constructor(scope: Construct, id: string, props?: RedriveStateMachineProps) {
    super(scope, id, {
      description: 'backend/orchestration/redrive-state-machine.lambda.ts',
      ...props,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/redrive-state-machine.lambda.bundle')),
    });
  }
}