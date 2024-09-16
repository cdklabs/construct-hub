// ~~ Generated by projen. To modify, edit .projenrc.ts and run "npx projen".
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ClientTestProps extends lambda.FunctionOptions {
}

export class ClientTest extends lambda.Function {
  constructor(scope: Construct, id: string, props?: ClientTestProps) {
    super(scope, id, {
      description: '__tests__/backend/deny-list/mocks/client-test.lambda.ts',
      ...props,
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/client-test.lambda.bundle')),
    });
  }
}