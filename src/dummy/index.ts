import { join } from 'path';
import { Runtime } from '@aws-cdk/aws-lambda';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import { Construct } from '@aws-cdk/core';

export class Dummy extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new NodejsFunction(this, 'NodejsFunction', {
      entry: join(__dirname, 'handler.ts'),
      runtime: Runtime.NODEJS_14_X,
    });
  }
}