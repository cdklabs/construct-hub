import * as path from 'path';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';

export interface BadgeRedirectFunctionProps
  extends Partial<cloudfront.FunctionProps> {}

export class BadgeRedirectFunction extends cloudfront.Function {
  constructor(
    scope: Construct,
    id: string,
    props: BadgeRedirectFunctionProps = {}
  ) {
    super(scope, id, {
      code: cloudfront.FunctionCode.fromFile({
        filePath: path.join(__dirname, '/redirect-function.js'),
      }),
      ...props,
    });
  }
}
