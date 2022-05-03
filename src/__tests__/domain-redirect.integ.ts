import * as route53 from '@aws-cdk/aws-route53';
import { App, Stack } from '@aws-cdk/core';
import { DomainRedirect } from '../domain-redirect';

const app = new App();

const stack = new Stack(app, 'DomainRedirectIntegrationTest', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
});

const sourceZone = route53.HostedZone.fromHostedZoneAttributes(
  stack,
  'SourceZone',
  {
    hostedZoneId: process.env.SOURCE_ZONE_ID ?? 'AZ1234',
    zoneName: process.env.SOURCE_ZONE_NAME ?? 'from.com',
  }
);

new DomainRedirect(stack, 'MyDomainRedirect', {
  source: { hostedZone: sourceZone },
  targetDomainName: 'constructs.dev',
});

app.synth();
