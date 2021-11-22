import * as route53 from '@aws-cdk/aws-route53';
import { App, Stack } from '@aws-cdk/core';
import { DomainRedirect } from '../domain-redirect';

const app = new App();
const stack = new Stack(app, 'DomainRedirectTest', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
new DomainRedirect(stack, 'DomainRedirect', {
  source: {
    hostedZone: route53.HostedZone.fromHostedZoneAttributes(stack, 'HostedZone', {
      hostedZoneId: 'Z0167129V25WO6SUQE3H',
      zoneName: 'benisrae.people.aws.dev',
    }),
  },
  targetDomainName: 'constructs.dev',
});

app.synth();