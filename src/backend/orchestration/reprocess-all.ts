// ~~ Generated by projen. To modify, edit .projenrc.js and run "npx projen".
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from '@aws-cdk/core';

export interface ReprocessAllProps extends lambda.FunctionOptions {
}

export class ReprocessAll extends lambda.Function {
  constructor(scope: Construct, id: string, props?: ReprocessAllProps) {
    super(scope, id, {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/reprocess-all.bundle')),
      description: 'backend/orchestration/reprocess-all.lambda.ts',
      ...props,
    });
  }
}