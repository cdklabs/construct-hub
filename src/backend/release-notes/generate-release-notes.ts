// ~~ Generated by projen. To modify, edit .projenrc.js and run "npx projen".
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface GenerateReleaseNotesProps extends lambda.FunctionOptions {
}

export class GenerateReleaseNotes extends lambda.Function {
  constructor(scope: Construct, id: string, props?: GenerateReleaseNotesProps) {
    super(scope, id, {
      description: 'backend/release-notes/generate-release-notes.lambda.ts',
      ...props,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/generate-release-notes.lambda.bundle')),
    });
  }
}