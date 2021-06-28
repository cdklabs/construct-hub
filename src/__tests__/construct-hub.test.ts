import { SynthUtils } from '@aws-cdk/assert';
import { DnsValidatedCertificate } from '@aws-cdk/aws-certificatemanager';
import { PublicHostedZone } from '@aws-cdk/aws-route53';
import { App, Stack } from '@aws-cdk/core';
import { ConstructHub } from '../construct-hub';

const dummyAlarmAction = {
  highSeverity: 'arn:aws:sns:us-east-1:123456789012:mystack-mytopic-NZJ5JSMVGFIE',
};

test('minimal usage', () => {
  const app = new App();
  const stack = new Stack(app, 'Test');
  new ConstructHub(stack, 'ConstructHub', {
    alarmActions: dummyAlarmAction,
  });
  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});

test('with domain', () => {
  const app = new App();
  const stack = new Stack(app, 'Test');

  const zone = PublicHostedZone.fromHostedZoneAttributes(stack, 'Zone', {
    hostedZoneId: 'ZONEID',
    zoneName: 'my.construct.hub',
  });

  const cert = new DnsValidatedCertificate(stack, 'Cert', { hostedZone: zone, domainName: zone.zoneName });

  new ConstructHub(stack, 'ConstructHub', {
    domain: {
      zone, cert,
    },
    alarmActions: dummyAlarmAction,
  });

  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});