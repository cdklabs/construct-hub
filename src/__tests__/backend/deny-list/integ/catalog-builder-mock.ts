// undefined
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from '@aws-cdk/core';

export interface CatalogBuilderMockProps extends lambda.FunctionOptions {
}

export class CatalogBuilderMock extends lambda.Function {
  constructor(scope: Construct, id: string, props?: CatalogBuilderMockProps) {
    super(scope, id, {
      description: '__tests__/backend/deny-list/integ/catalog-builder-mock.lambda.ts',
      ...props,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/catalog-builder-mock.lambda.bundle')),
    });
  }
}