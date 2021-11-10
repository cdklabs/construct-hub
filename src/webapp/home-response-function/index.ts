import * as path from 'path';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import { Construct } from '@aws-cdk/core';

export interface HomeResponseFunctionProps extends Partial<cloudfront.FunctionProps> {}

export class HomeResponseFunction extends cloudfront.Function {
  constructor(scope: Construct, id: string, props: HomeResponseFunctionProps = {}) {
    super(scope, id, {
      code: cloudfront.FunctionCode.fromFile({
        filePath: path.join(__dirname, '/home-response-function.js'),
      }),
      ...props,
    });
  }
}
