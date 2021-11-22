import '@aws-cdk/assert/jest';
import { SynthUtils } from '@aws-cdk/assert';
import { Certificate } from '@aws-cdk/aws-certificatemanager';
import { HostedZone } from '@aws-cdk/aws-route53';
import { Stack } from '@aws-cdk/core';
import { DomainRedirect } from '../domain-redirect';

test('minimal usage', () => {
  const stack = new Stack();
  new DomainRedirect(stack, 'DomainRedirect', {
    source: {
      hostedZone: HostedZone.fromHostedZoneAttributes(stack, 'HostedZone', {
        hostedZoneId: 'AZ1234',
        zoneName: 'from.com',
      }),
    },
    targetDomainName: 'to.bar.com',
  });

  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();

  // bucket is set up with redirect
  expect(stack).toHaveResource('AWS::S3::Bucket', {
    WebsiteConfiguration: {
      RedirectAllRequestsTo: {
        HostName: 'to.bar.com',
      },
    },
  });

  // DNS-validate certificate is automatically created
  expect(stack).toHaveResource('AWS::CloudFormation::CustomResource', {
    DomainName: 'from.com',
    HostedZoneId: 'AZ1234',
  });
});

test('certificate is passed by user', () => {
  const stack = new Stack();
  const cert = new Certificate(stack, 'Cert', {
    domainName: 'from.com',
  });

  new DomainRedirect(stack, 'DomainRedirect', {
    source: {
      certificate: cert,
      hostedZone: HostedZone.fromHostedZoneAttributes(stack, 'HostedZone', {
        hostedZoneId: 'AZ1234',
        zoneName: 'from.com',
      }),
    },
    targetDomainName: 'to.bar.com',
  });

  // DNS-validate certificate is automatically created
  expect(stack).not.toHaveResource('AWS::CloudFormation::CustomResource');
});