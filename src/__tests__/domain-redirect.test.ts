import '@aws-cdk/assert/jest';
import { SynthUtils } from '@aws-cdk/assert';
import { Certificate } from '@aws-cdk/aws-certificatemanager';
import { HostedZone } from '@aws-cdk/aws-route53';
import { Stack, Construct } from '@aws-cdk/core';
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

test('a bucket is created for each redirect target', () => {
  // GIVEN
  const stack = new Stack();
  const target1 = 'to.bar1.com';
  const target2 = 'to.bar2.com';
  const source1 = HostedZone.fromHostedZoneAttributes(stack, 'HostedZone1', { hostedZoneId: 'AZ1234', zoneName: 'from1.com' });
  const source2 = HostedZone.fromHostedZoneAttributes(stack, 'HostedZone2', { hostedZoneId: 'AZ1234', zoneName: 'from2.com' });
  const source3 = HostedZone.fromHostedZoneAttributes(stack, 'HostedZone3', { hostedZoneId: 'AZ1234', zoneName: 'from3.com' });

  // WHEN
  new DomainRedirect(stack, 'DomainRedirect1to1', {
    source: { hostedZone: source1 },
    targetDomainName: target1,
  });

  new DomainRedirect(stack, 'DomainRedirect3to2', {
    source: { hostedZone: source3 },
    targetDomainName: target2,
  });

  // put another redirect to target1 inside a subtree and make sure it reuses the same bucket
  const subtree = new Construct(stack, 'Subtree');
  new DomainRedirect(subtree, 'DomainRedirect2to1', {
    source: { hostedZone: source2 },
    targetDomainName: target1,
  });


  // THEN

  // we only have two buckets (one for each target).
  expect(SynthUtils.synthesize(stack).template).toMatchSnapshot();
  expect(stack).toCountResources('AWS::S3::Bucket', 2);
});