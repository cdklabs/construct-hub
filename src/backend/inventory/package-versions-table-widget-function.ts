// undefined
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from '@aws-cdk/core';

export interface PackageVersionsTableWidgetFunctionProps extends lambda.FunctionOptions {
}

export class PackageVersionsTableWidgetFunction extends lambda.SingletonFunction {
  constructor(scope: Construct, id: string, props?: PackageVersionsTableWidgetFunctionProps) {
    super(scope, id, {
      description: 'backend/inventory/package-versions-table-widget-function.lambda.ts',
      ...props,
      uuid: '5fa84825-9c1d-5e38-8c0d-f69f05c016df',
      lambdaPurpose: 'PackageVersionsTableWidget-Handler',
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/package-versions-table-widget-function.lambda.bundle')),
    });
  }
}