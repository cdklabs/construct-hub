// undefined
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from '@aws-cdk/core';

export interface NpmJsFollowerProps extends lambda.FunctionOptions {
}

export class NpmJsFollower extends lambda.Function {
  constructor(scope: Construct, id: string, props?: NpmJsFollowerProps) {
    super(scope, id, {
      description: 'package-sources/npmjs/npm-js-follower.lambda.ts',
      ...props,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/npm-js-follower.lambda.bundle')),
    });
  }
}