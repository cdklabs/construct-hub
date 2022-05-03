import * as path from 'path';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import { Construct } from '@aws-cdk/core';

export interface ResponseFunctionProps
  extends Partial<cloudfront.FunctionProps> {}

export class ResponseFunction extends cloudfront.Function {
  constructor(scope: Construct, id: string, props: ResponseFunctionProps = {}) {
    super(scope, id, {
      code: cloudfront.FunctionCode.fromFile({
        filePath: path.join(__dirname, '/response-function.js'),
      }),
      ...props,
    });
  }
}
