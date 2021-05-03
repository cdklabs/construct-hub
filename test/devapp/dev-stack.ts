import * as route53 from '@aws-cdk/aws-route53';
import { Construct, Stack } from '@aws-cdk/core';
import { ConstructHub } from '../../src';

export class DevStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
      },
    });

    const zone = new route53.HostedZone(this, 'HostedZone', {
      zoneName: 'hub.constructs.test',
    });

    new ConstructHub(this, 'ConstructHub', {
      hostedZone: zone,
    });
  }
}
