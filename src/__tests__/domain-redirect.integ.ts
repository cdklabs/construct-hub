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

const sourceZone = new route53.PublicHostedZone(stack, 'SourceZone', {
  zoneName: 'my.domain.com',
});

new DomainRedirect(stack, 'DomainRedirect', {
  source: { hostedZone: sourceZone },
  targetDomainName: 'constructs.dev',
});

app.synth();