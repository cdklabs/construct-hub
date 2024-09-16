import { IntegTest } from '@aws-cdk/integ-tests-alpha';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as core from 'aws-cdk-lib/core';
import { DomainRedirect } from '../lib/domain-redirect';

/**
 * Running this integ test
 *
 * To run this test case, you will need a hosted zone setup in the account you are deploying to.
 * Then export the following environment variables:
 *
 * ```console
 * export SOURCE_ZONE_ID=your_hosted_zone_id
 * export SOURCE_ZONE_NAME=your_hosted_zone_name
 * ```
 *
 * Now run the integ test to confirm it is passing.
 * This will include your hosted zone information in the snapshot, which needs to be removed.
 *
 * To do that, remove the env variables again:
 *
 * ```console
 * unset SOURCE_ZONE_ID
 * unset SOURCE_ZONE_NAME
 * ```
 *
 * Then run the integ test in dry-run to accept the snapshot:
 *
 * ```console
 * yarn integ-runner --language typescript --force integ.domain-redirect --dry-run
 * ```
 */

const app = new core.App();

const stack = new core.Stack(app, 'DomainRedirectIntegrationTest', {
  env: {
    region: 'us-east-1',
  },
});

const sourceZone = route53.HostedZone.fromHostedZoneAttributes(
  stack,
  'SourceZone',
  {
    hostedZoneId: process.env.SOURCE_ZONE_ID ?? 'Z1234567ABCDEF1V2T3E',
    zoneName: process.env.SOURCE_ZONE_NAME ?? 'integ.constructs.dev',
  }
);

new DomainRedirect(stack, 'MyDomainRedirect', {
  source: {
    hostedZone: sourceZone,
  },
  targetDomainName: 'constructs.dev',
});

new IntegTest(app, 'domain-redirect-integ', {
  testCases: [stack],
});
