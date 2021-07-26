// ~~ Generated by projen. To modify, edit .projenrc.js and run "npx projen".
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from 'constructs';

export interface CleanUpEfsProps extends lambda.FunctionOptions {
}

export class CleanUpEfs extends lambda.Function {
  constructor(scope: Construct, id: string, props?: CleanUpEfsProps) {
    super(scope, id, {
      ...props,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/clean-up-efs.bundle')),
    });
  }
}