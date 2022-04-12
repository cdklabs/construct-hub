import { CfnRepository } from '@aws-cdk/aws-codeartifact';
import { IGrantable, User } from '@aws-cdk/aws-iam';
import { Function } from '@aws-cdk/aws-lambda';
import { IBucket } from '@aws-cdk/aws-s3';
import { IQueue } from '@aws-cdk/aws-sqs';
import { App, ConstructNode, Stack } from '@aws-cdk/core';
import { DenyList, IDenyList } from '../../backend';
import { ILicenseList } from '../../backend/license-list/api';
import { Monitoring } from '../../monitoring';
import { OverviewDashboard } from '../../overview-dashboard';
import { CodeArtifact } from '../../package-sources/code-artifact';
import { safeMock } from '../safe-mock';

test('default configuration', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'Test');
  const mockRepository = safeMock<CfnRepository>('mockRepository', {
    attrDomainOwner: '123456789012',
    attrDomainName: 'mock-domain-name',
    attrName: 'mock-repository-name',
    node: safeMock<ConstructNode>('mockRepository.node', { path: 'fake/path/to/repository' }),
  });

  const mockDenyListGrantRead = jest.fn().mockName('mockDenyList.grantRead');
  const mockLicenseListGrantRead = jest.fn().mockName('mockLicenseList.grantRead');
  const mockQueueGrantSendMessages = jest.fn().mockName('mockQueue.grantSendMessages');
  const mockMonitoringAddLowSeverityAlarm = jest.fn().mockName('mockMonitoring.addLowSeverityAlarm');
  const mockMonitoringAddHighSeverityAlarm = jest.fn().mockName('mockMonitoring.addHighSeverityAlarm');
  const mockAddDLQMetricToOnCallDashboard = jest.fn().mockName('mockAddDLQMetricToOnCallDashboard');
  const mockAddConcurrentExecutionMetricToOnCallDashboard = jest.fn().mockName('mockAddConcurrentExecutionMetricToOnCallDashboard');

  const mockDenyList = safeMock<DenyList>('mockDenyList', {
    grantRead: mockDenyListGrantRead,
  });
  const mockLicenseList = safeMock<ILicenseList>('mockLicenseList', {
    grantRead: mockLicenseListGrantRead,
  });
  const mockIngestion = safeMock<IGrantable>('mockIngestion', {
    grantPrincipal: new User(stack, 'MockIngestionRole'),
  });
  const mockMonitoring = safeMock<Monitoring>('mockMonitoring', {
    addLowSeverityAlarm: mockMonitoringAddLowSeverityAlarm,
    addHighSeverityAlarm: mockMonitoringAddHighSeverityAlarm,
  });

  const mockOnCallDashboard = safeMock<OverviewDashboard>('mockOnCallDashboard', {
    addDLQMetricToDashboard: mockAddDLQMetricToOnCallDashboard,
    addConcurrentExecutionMetricToOnCallDashboard: mockAddConcurrentExecutionMetricToOnCallDashboard,
  });
  const mockQueue = safeMock<IQueue>('mockQueue', {
    grantSendMessages: mockQueueGrantSendMessages,
    queueUrl: 'https://fake-queue-url/phony',
  });

  // WHEN
  const source = new CodeArtifact({ repository: mockRepository });
  const bound = source.bind(stack, {
    baseUrl: 'https://dummy.cloudfront.net',
    denyList: mockDenyList,
    licenseList: mockLicenseList,
    ingestion: mockIngestion,
    monitoring: mockMonitoring,
    onCallDashboard: mockOnCallDashboard,
    queue: mockQueue,
  });

  // THEN
  // Not gonna check all the contents therein... This is very UI-ey.
  expect(bound).toBeDefined();
  expect(mockDenyListGrantRead).toHaveBeenCalledTimes(1);
  expect(mockLicenseListGrantRead).toHaveBeenCalledTimes(1);
  expect(mockQueueGrantSendMessages).toHaveBeenCalledTimes(1);
  expect(mockMonitoringAddLowSeverityAlarm).toHaveBeenCalledTimes(1);
  expect(mockMonitoringAddHighSeverityAlarm).toHaveBeenCalledTimes(1);
  expect(app.synth().getStackByName(stack.stackName).template).toMatchSnapshot();
});

test('user-provided staging bucket', () => {
  // GIVEN
  const app = new App();
  const stack = new Stack(app, 'Test');
  const mockRepository = safeMock<CfnRepository>('mockRepository', {
    attrDomainOwner: '123456789012',
    attrDomainName: 'mock-domain-name',
    attrName: 'mock-repository-name',
    node: safeMock<ConstructNode>('mockRepository.node', { path: 'fake/path/to/repository' }),
  });

  const mockBucketGrantRead = jest.fn().mockName('mockBucket.grantRead');
  const mockBucketGrantReadWrite = jest.fn().mockName('mockBucket.grantReadWrite');
  const mockDenyListGrantRead = jest.fn().mockName('mockDenyList.grantRead');
  const mockLicenseListGrantRead = jest.fn().mockName('mockLicenseList.grantRead');
  const mockQueueGrantSendMessages = jest.fn().mockName('mockQueue.grantSendMessages');
  const mockMonitoringAddLowSeverityAlarm = jest.fn().mockName('mockMonitoring.addLowSeverityAlarm');
  const mockMonitoringAddHighSeverityAlarm = jest.fn().mockName('mockMonitoring.addHighSeverityAlarm');
  const mockAddDLQMetricToOnCallDashboard = jest.fn().mockName('mockAddDLQMetricToOnCallDashboard');
  const mockAddConcurrentExecutionMetricToOnCallDashboard = jest.fn().mockName('mockAddConcurrentExecutionMetricToOnCallDashboard');


  const mockBucket = safeMock<IBucket>('mockBucket', {
    bucketName: 'mock-bucket',
    grantRead: mockBucketGrantRead,
    grantReadWrite: mockBucketGrantReadWrite,
  });
  const mockDenyList = safeMock<IDenyList>('mockDenyList', {
    grantRead: mockDenyListGrantRead,
  });
  const mockLicenseList = safeMock<ILicenseList>('mockLicenseList', {
    grantRead: mockLicenseListGrantRead,
  });
  const mockIngestion = safeMock<IGrantable>('mockIngestion', {});
  const mockMonitoring = safeMock<Monitoring>('mockMonitoring', {
    addLowSeverityAlarm: mockMonitoringAddLowSeverityAlarm,
    addHighSeverityAlarm: mockMonitoringAddHighSeverityAlarm,
  });

  const mockOnCallDashboard = safeMock<OverviewDashboard>('mockOnCallDashboard', {
    addDLQMetricToDashboard: mockAddDLQMetricToOnCallDashboard,
    addConcurrentExecutionMetricToOnCallDashboard: mockAddConcurrentExecutionMetricToOnCallDashboard,
  });


  const mockQueue = safeMock<IQueue>('mockQueue', {
    grantSendMessages: mockQueueGrantSendMessages,
    queueUrl: 'https://fake-queue-url/phony',
  });

  // WHEN
  const source = new CodeArtifact({ bucket: mockBucket, repository: mockRepository });
  const bound = source.bind(stack, {
    baseUrl: 'https://dummy.cloudfront.net',
    denyList: mockDenyList,
    licenseList: mockLicenseList,
    ingestion: mockIngestion,
    monitoring: mockMonitoring,
    onCallDashboard: mockOnCallDashboard,
    queue: mockQueue,
  });

  // THEN
  // Not gonna check all the contents therein... This is very UI-ey.
  expect(bound).toBeDefined();
  expect(mockBucketGrantRead).toHaveBeenCalledWith(mockIngestion);
  expect(mockBucketGrantReadWrite).toHaveBeenCalledWith(expect.any(Function));
  expect(mockDenyListGrantRead).toHaveBeenCalledWith(expect.any(Function));
  expect(mockLicenseListGrantRead).toHaveBeenCalledWith(expect.any(Function));
  expect(mockQueueGrantSendMessages).toHaveBeenCalledWith(expect.any(Function));
  expect(mockMonitoringAddLowSeverityAlarm).toHaveBeenCalledTimes(1);
  expect(mockMonitoringAddHighSeverityAlarm).toHaveBeenCalledTimes(1);
  expect(app.synth().getStackByName(stack.stackName).template).toMatchSnapshot();
});
