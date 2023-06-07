import { App, Stack } from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { DomainRedirect } from '../domain-redirect';

const app = new App();

const stack = new Stack(app, 'DomainRedirectIntegrationTest', {
  env: {
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
