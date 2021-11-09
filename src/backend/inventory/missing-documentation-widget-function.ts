// ~~ Generated by projen. To modify, edit .projenrc.js and run "npx projen".
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from '@aws-cdk/core';

export interface MissingDocumentationWidgetFunctionProps extends lambda.FunctionOptions {
}

export class MissingDocumentationWidgetFunction extends lambda.SingletonFunction {
  constructor(scope: Construct, id: string, props?: MissingDocumentationWidgetFunctionProps) {
    super(scope, id, {
      description: 'backend/inventory/missing-documentation-widget-function.lambda.ts',
      ...props,
      uuid: '136351bd-e63b-5de8-bb16-730ac238d703',
      lambdaPurpose: 'MissingDocumnetationWidget-Handler',
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/missing-documentation-widget-function.lambda.bundle')),
    });
  }
}