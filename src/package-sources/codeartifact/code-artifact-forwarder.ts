// undefined
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from '@aws-cdk/core';

export interface CodeArtifactForwarderProps extends lambda.FunctionOptions {
}

export class CodeArtifactForwarder extends lambda.Function {
  constructor(scope: Construct, id: string, props?: CodeArtifactForwarderProps) {
    super(scope, id, {
      description: 'package-sources/codeartifact/code-artifact-forwarder.lambda.ts',
      ...props,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/code-artifact-forwarder.lambda.bundle')),
    });
  }
}