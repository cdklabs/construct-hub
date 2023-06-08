// ~~ Generated by projen. To modify, edit .projenrc.ts and run "npx projen".
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface VersionTrackerProps extends lambda.FunctionOptions {
}

export class VersionTracker extends lambda.Function {
  constructor(scope: Construct, id: string, props?: VersionTrackerProps) {
    super(scope, id, {
      description: 'backend/version-tracker/version-tracker.lambda.ts',
      ...props,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/version-tracker.lambda.bundle')),
    });
  }
}