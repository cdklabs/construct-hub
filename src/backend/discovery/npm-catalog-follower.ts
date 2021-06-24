// ~~ Generated by projen. To modify, edit .projenrc.js and run "npx projen".
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from 'constructs';

export interface NpmCatalogFollowerProps extends lambda.FunctionOptions {
}

export class NpmCatalogFollower extends lambda.Function {
  constructor(scope: Construct, id: string, props: NpmCatalogFollowerProps = {}) {
    super(scope, id, {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/npm-catalog-follower.bundle')),
      ...props,
    });
  }
}