// undefined
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from '@aws-cdk/core';

export interface PruneQueueHandlerProps extends lambda.FunctionOptions {
}

export class PruneQueueHandler extends lambda.Function {
  constructor(scope: Construct, id: string, props?: PruneQueueHandlerProps) {
    super(scope, id, {
      description: 'backend/deny-list/prune-queue-handler.lambda.ts',
      ...props,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/prune-queue-handler.lambda.bundle')),
    });
  }
}