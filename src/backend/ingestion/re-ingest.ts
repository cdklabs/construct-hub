// ~~ Generated by projen. To modify, edit .projenrc.js and run "npx projen".
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from '@aws-cdk/core';

export interface ReIngestProps extends lambda.FunctionOptions {
}

export class ReIngest extends lambda.Function {
  constructor(scope: Construct, id: string, props?: ReIngestProps) {
    super(scope, id, {
      description: 'backend/ingestion/re-ingest.lambda.ts',
      ...props,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/re-ingest.lambda.bundle')),
    });
  }
}