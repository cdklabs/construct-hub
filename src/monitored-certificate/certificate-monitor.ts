// ~~ Generated by projen. To modify, edit .projenrc.ts and run "npx projen".
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface CertificateMonitorProps extends lambda.FunctionOptions {
}

export class CertificateMonitor extends lambda.Function {
  constructor(scope: Construct, id: string, props?: CertificateMonitorProps) {
    super(scope, id, {
      description: 'monitored-certificate/certificate-monitor.lambda.ts',
      ...props,
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/certificate-monitor.lambda.bundle')),
    });
  }
}