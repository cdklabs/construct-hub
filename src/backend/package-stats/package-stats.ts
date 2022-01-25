// undefined
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from '@aws-cdk/core';

export interface PackageStatsProps extends lambda.FunctionOptions {
}

export class PackageStats extends lambda.Function {
  constructor(scope: Construct, id: string, props?: PackageStatsProps) {
    super(scope, id, {
      description: 'backend/package-stats/package-stats.lambda.ts',
      ...props,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/package-stats.lambda.bundle')),
    });
  }
}