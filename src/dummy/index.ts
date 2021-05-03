import { join } from 'path';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import { Construct } from '@aws-cdk/core';

export class Dummy extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new NodejsFunction(this, 'NodejsFunction', {
      entry: join(__dirname, 'handler.ts'),
    });
  }
}