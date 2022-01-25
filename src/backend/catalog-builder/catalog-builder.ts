// undefined
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from '@aws-cdk/core';

export interface CatalogBuilderProps extends lambda.FunctionOptions {
}

export class CatalogBuilder extends lambda.Function {
  constructor(scope: Construct, id: string, props?: CatalogBuilderProps) {
    super(scope, id, {
      description: 'backend/catalog-builder/catalog-builder.lambda.ts',
      ...props,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/catalog-builder.lambda.bundle')),
    });
  }
}