import { SynthUtils } from '@aws-cdk/assert';
import { DnsValidatedCertificate } from '@aws-cdk/aws-certificatemanager';
import { PublicHostedZone } from '@aws-cdk/aws-route53';
import { App, Stack } from '@aws-cdk/core';
import { ConstructHub, Isolation } from '../construct-hub';

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

test('piggy-backing on an existing CodeArtifact domain', () => {
  const app = new App();
  const stack = new Stack(app, 'Test');
  new ConstructHub(stack, 'ConstructHub', {
    alarmActions: dummyAlarmAction,
    codeArtifactDomain: {
      name: 'existing-domain-name',
      upstreams: ['repo-1', 'repo-2'],
    },
  });
  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});

test('with all internet access', () => {
  const app = new App();
  const stack = new Stack(app, 'Test');
  new ConstructHub(stack, 'ConstructHub', {
    alarmActions: dummyAlarmAction,
    sensitiveTaskIsolation: Isolation.UNLIMITED_INTERNET_ACCESS,
  });
  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});

test('with limited internet access', () => {
  const app = new App();
  const stack = new Stack(app, 'Test');
  new ConstructHub(stack, 'ConstructHub', {
    alarmActions: dummyAlarmAction,
    sensitiveTaskIsolation: Isolation.LIMITED_INTERNET_ACCESS,
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

test('uses failover buckets when requested', () => {

  const app = new App();
  const stack = new Stack(app, 'Test');

  new ConstructHub(stack, 'ConstructHub', {
    failoverStorage: true,
  });

  // filter out bucket policies since they can still refer to the primary buckets.
  const cfn: any = { Resources: {} };
  for (const [id, resource] of Object.entries(SynthUtils.toCloudFormation(stack).Resources) as Array<any>) {
    if (resource.Type !== 'AWS::S3::BucketPolicy') {
      cfn.Resources[id] = resource;
    }
  }

  // make sure all other references point to the failover buckets.
  recursiveValidate(cfn, 'Ref', (value: string) => {

    const resource = cfn.Resources[value];
    if (resource && resource.Type === 'AWS::S3::Bucket') {
      const failoverTag = resource.Properties.Tags.filter((t: any) => t.Key === 'failover')[0];
      expect(failoverTag).toBeDefined();
      expect(failoverTag.Value).toEqual('true');
    }

  });

});

function recursiveValidate(heystack: any, needle: string, validation: (value: any) => void) {
  Object.keys(heystack).forEach(key => {
    const value = heystack[key];
    if (key === needle && typeof value !== 'object') {
      validation(value);
    } else if (typeof value === 'object') {
      recursiveValidate(value, needle, validation);
    }
  });
};
