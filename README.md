# Construct Hub

This project maintains a [AWS Cloud Development Kit][aws-cdk] construct library
that can be used to deploy instances of the Construct Hub in any AWS Account.

This software backs the public instance of the
[ConstructHub](https://constructs.dev), and can be used to deploy a self-hosted
instance with personalized configuration.

[aws-cdk]: https://github.com/aws/aws-cdk


## :question: Getting Started

> :warning: Disclaimer
>
> The [public instance of ConstructHub](https://constructs.dev) is currently in
> *Developer Preview*.
>
> Self-hosted ConstructHub instances are however in active development and
> should be considered *experimental*. Breaking changes to the public API of
> this package are expected to be released without prior notice, and the
> infrastructure and operational posture of ConstructHub instances may also
> significantly change.
>
> You are welcome to deploy self-hosted instances of ConstructHub for evaluation
> purposes, and we welcome any feedback (good or bad) from your experience in
> doing so.

### Quick Start

Once you have installed the `construct-hub` library in your project, the
simplest way to get started is to create an instance of the `ConstructHub`
construct:

```ts
import { App, Stack } from '@aws-cdk/core';
import { ConstructHub } from 'construct-hub';

// The usual... you might have used `cdk init app` instead!
const app = new App();
const stack = new Stack(app, 'StackName', { /* ... */ });

// Now to business!
new ConstructHub(stack, 'ConstructHub');
```

### Persionalization

#### Using a custom domain name

In order to use a custom domain for your ConstructHub instance instead of the
default CloudFront domain name, specify the `domain` property with the following
elements:

Attribute                     | Description
------------------------------|---------------------------------------------------------------------
`zone`                        | A Route53 Hosted Zone, where DNS records will be added.
`cert`                        | An Amazon Certificate Manager certificate, which must be in the `us-east-1` region.
`monitorCertificateExpiration`| Set to `false` if you do not want an alarm to be created when the certificate is close to expiry.

Your self-hosted ConstructHub instance will be served from the root of the
provided `zone`, so the certificate must match this name.

#### Alternate package sources

By default, ConstructHub has a single package source configured: the public
`npmjs.com` registry. Self-hosted instances typically should list packages from
alternate sources, either in addition to packages from `npmjs.com`, or instead
of those.

The `packageSources` property can be used to replace the default set of package
sources configured on the instance. ConstructHub provides `IPackageSource`
implementations for the public `npmjs.com` registry as well as for private
CodeArtifact repositories:

```ts
import * as codeartifact from '@aws-cdk/aws-codeartifact';
import { App, Stack } from '@aws-cdk/core';
import { sources, ConstructHub } from 'construct-hub';

// The usual... you might have used `cdk init app` instead!
const app = new App();
const stack = new Stack(app, 'StackName', { /* ... */ });

// Now to business!
const registry = new codeartifact.CfnRegistry(stack, 'Registry', {
  // ....
});
new ConstructHub(stack, 'ConstructHub', {
  packageSources: [
    new sources.NpmJs(), // Remove if you do NOT want npmjs.com packages
    new sources.CodeArtifact({ registry }),
  ],
});
```

You may also implement a custom `IPackageSource` if you want to index packages
from alternate locations. In this case, the component you provide will be
responsible for sending notifications to an SQS Queue about newly discovered
packages. You may refer to the [sources.NpmJs] and [sources.CodeArtifact]
implementations as a reference for hos this can be done.

[sources.NpmJs]: src/package-sources/npmjs.ts
[sources.CodeArtifact]: src/package-sources/code-artifact.ts

#### Package deny list

Certain packages may be undesirable to show in your self-hosted ConstructHub
instance. In order to prevent a package from ever being listed in construct hub,
the `denyList` property can be configured with a set of `DenyListRule` objects
that specify which package or package versions should never be lested:

```ts
import { App, Stack } from '@aws-cdk/core';
import { ConstructHub } from 'construct-hub';

// The usual... you might have used `cdk init app` instead!
const app = new App();
const stack = new Stack(app, 'StackName', { /* ... */ });

// Now to business!
new ConstructHub(stack, 'ConstructHub', {
  denyList: [
    // Denying _all_ versions of the "sneaky-hackery" package
    { packageName: 'sneaky-hackery', reason: 'Mines bitcoins wherever it gets installed' },
    // Denying _a specific_ version of the "bad-release" package
    { packageName: 'bad-release', version: '1.2.3', reason: 'CVE-####-#####' },
  ],
});
```

#### Decrease deployment footprint

By default, ConstructHub executes the documentation rendering process in the
context of isolated subnets. This is a defense-in-depth mechanism to mitigate
the risks associated with downloading aribtrary (un-trusted) *npm packages* and
their dependency closures.

This layer of security implies the creation of a number of resources that can
increase the operating cost of your self-hosted instance: several VPC endpoints
are created, an internal CodeArtifact repository needs to be provisioned, etc...

While we generally recommend leaving these features enabled, if your self-hosted
ConstructHub instance only indexes *trusted* packages (as could be the case for
an instance that does not list packages from the public `npmjs.com` registry),
you may set the `isolateLambdas` setting to `false`.


## :gear: Operating a self-hosted instance

### Application Overview

This section aims to provide a high-level view of what components make up a
self-hosted ConstructHub instance, and troubleshooting guidance where
appropriate.

#### High-Level Architecture

The frontend of ConstructHub instances is a single-page web-app (developed in
the [cdklabs/construct-hub-webapp] repository), served from an S3 bucket by a
CloudFront Web Distribution.

The CloudFront Web Distribution also serves objects from a second S3 bucket that
is used by the backend application to store indexed package data that is
presented by the fronted.

The backend of ConstructHub instances is an event-driven, serverless application
that performes the following tasks:

1. A *package source* implementation notifes the ConstructHub instance of new
   packages by sending messages to an ingestion SQS queue.
1. The *ingestion* function is triggered by the ingestion SQS queue, and
   verifies the new package version is compliant, before starting up the backend
   workflow.
1. The *backend workflow* is a StepFunctions State Machine that orchestrates the
   necessary steps to fully index a package into a ConstructHub instance.
1. The *prune* function enforces the configured deny-list and ensures previously
   indexed packages that are now part of the deny-list are removed from storage
   within an hour.

[cdklabs/construct-hub-webapp]: https://github.com/cdklabs/construct-hub-webapp

##### 1. Package Sources

ConstructHub provides two package source implementations: `NpmJs` and
`CodeArtifact`.

* The `NpmJs` source interfaces with the `npmjs.com` CouchDB replica (which is
  at `replicate.npmjs.com/registry`) by following it's `_changes` stream in
  search of relevant packages. When such a package is identified, it is staged
  into an S3 bucket then notified to the ingestion SQS queue. The CouchDB
  follower is a Lambda function that is scheduled to run every `5 minutes`, and
  stores the current CouchDB sequence ID in a specific object in the S3 bucket
  used for staging packages.

  - A **high-severity** alarm triggers if the NpmJs Follower is not running at
    the scheduled cadence, or if it encounters failures for more than
    `15 minutes`.

  - Troubleshooting the NpmJs Follower can be done by inspecting its log traces
    in CloudWatch Logs, or by looking at service maps in the X-Ray console.

  - The NpmJs Follower produces a set of metrics that are automatically inserted
    in the *Backend Dashboard*, including the following:
    + `NpmJsChangeAge` shows how far behind the public `npmjs.com` registry the
      current CouchDB sequence ID is. In steady state (once the initial backfill
      has completed), this metric should always be below `5 minutes`.
    + `PackageVersionAge` is the amount of time elapsed between the publication
      of a package version in the public `npmjs.com` registry, and when that was
      signalled to the ingestion SQS queue. In steady state, this metric should
      always be below `5 minutes`.
    + `UnprocessableEntity` is the count of events received from the CouchDB
      instance that could not be processed. This metric is not emitted if no
      event was found unprocessable. The CloudWatch Logs for the NpmJs Follower
      will contain additional information about those events.

* The `CodeArtifact` source leverages EventBridge events emitted by any
  CodeArtifact repository when packages it contains are modified (created,
  updated, deleted). It considers only events pertaining to `npm` packages
  published the specific CodeArtifact Repository that it is configured with. A
  Lambda Function verifies the package version from the event is eligible for
  ConstructHub (i.e: it is a `jsii` package, using an allowed license, etc...)
  before staging it in an S3 bucket, then notifying the ingestion SQS Queue.

  - A **high-severity** alarm triggers if the CodeArtifact Fowarder function
    encounters failures.

  - Troubleshooting the CodeArtifact Forwarder can be done by inspecting its log
    traces in CloudWatch Logs, or by looking at service maps in the X-Ray
    console.

* Third party package-sources can also be used. Please refer to these sources'
  documentation for monitoring & troubleshooting guidance.

##### 2. Ingestion

The *ingestion* process is implemented by a Lambda Function triggered directly
from the ingestion SQS queue. It performs the following steps:

1. Download the tarball from the S3 location indicated in the ingestion payload
1. Validate the input payload using the `integrity` checksum
1. Validate that it is eligible for indexing:
   - It contains a `.jsii` assembly document that is valid
   - It is released under an allowed license
   - Essential `.jsii` assembly corresponds to the `package.json` document
     - The package name must be identical
     - The package version must be identical
     - The license must be identical
   - The package version is not listed in the configured deny list
1. Attempt to identify a `LICENSE` file bundled in the package
1. Uploads the tarball to the package data S3 bucket
1. Creates the `manifest.json` object in the package data S3 bucket, containing:
   - The contents of the `LICENSE` file (if one was found)
   - The publication timestamp for the package version
1. Uploads the `.jsii` assembly to the package data S3 bucket as `assembly.json`
1. Triggers the *Backend Workflow* for the package version

A **high-severity** alarm triggers if the *ingestion* function encounters
failures, or if the ingestion SQS queue has messages older than `10 minutes`
approximately.

If the *ingestion* function fails for a particular queue message more than `5`
times, that message will be moved into a dead-letter queue. A **high-severity**
alarm triggers when the dead-letter queue is not empty.

Troubleshooting the *ingestion* function can be done by inspecting its log
traces in CloudWatch Logs, or by looking at service maps in the X-Ray console.
The function also produces several CloudWatch metrics that are visible in the
*Backend Dashboard*, including:
- `InvalidTarball` is the count of package versions that were rejected due to
  having an invalid tarball (missing the `package.json` file or `.jsii`
  assembly).
- `InvalidAssembly` is the count of package versions that were rejected due to
  containing an invalid `.jsii` assembly (in most cases, these are old packages
  that were built using a pre-1.0 release of `jsii` that is no longer supported)
- `MismatchedIdentityRejections` is the count of package versions that were
  rejected due to differences between data in the `.jsii` assembly and
  `package.json` files.
- `IneligibleLicense` is the count of package versions that were rejected due to
  using a license that is not in the configured license allow-list.
- `FoundLicenseFile` is the count of ingested package versions for which a
  `LICENSE` file could be identified.

##### 3. Backend Workflow

The *Backend Workflow* is a StepFunctions State Machine that performs the
following tasks:

1. Execute the documentation rendering process for each supported language
   (TypeScript, Python, ...)
1. If any documentation could be rendered, adds the package version to the
   `catalog.json` object (which is a no-op if the package version is not the
   *latest* known release of it's major line)

When any step of the State Machine fails, a message is sent to a dead-letter
queue. That message includes information about the failure that happened (in
case multiple failures happened, only one cause will be represented), and
information about the State Machine execution (which can be used to review the
full execution log in the AWS Console, or using the StepFunctions API).

Executions that successfully sent a message to the dead-letter queue will show
as "success". Conversely, "failed" executions may not have a corresponding
message in the dead-letter queue and must be troubleshooted starting from the
failed execution instead.

A **high-severity** alarm trigegrs if the State Machine dead-letter queue is not
empty, or if any execution fails.

Troubleshooting can be done by reviewing State Machine execution events in the
StepFunctions console (or using the StepFunctions API), reviewing the log traces
of each step in CloudWAtch Logs, or by looking service maps in the X-Ray
console.

Messages from the dead-letter queue can be fed back to the State Machine by
using the "Redrive DLQ" Lambda Function, that is linked from the *Backend
Dashboard*.

##### 4. Deny List Processes

Each ConstructHub instance can be configured with an optional set of deny-list
rules, to prevent packgaes from being indexed in that instance. If a package was
already indexed at the time it is added to the deny-list, all indexed assets for
it will be deleted by a *prune* Lambda Function.

A **high-severity** alarm triggers if the *prune* function does not run at the
configured cadence, or if ti encounters failures.

Troubleshooting can be done by inspecting the log traces it produces in
CloudWatch Logs, or by looking at service maps in the X-Ray console.

The *prune* function emits a `Rules` CloudWatch Metric that indicates how many
deny-list rules it is currently enforcing. This could match the amount of rules
that were configured on the ConstructHub instance.

### Monitoring & Alarming

Each ConstructHub instance comes with a set of CloudWatch dashboards that can be
used to monitor the current state of the instance. The name of the backend
dashboard can be configured using the `backendDashboardName` property of the
`ConstructHub` construct:

```ts
import { App, Stack } from '@aws-cdk/core';
import { ConstructHub } from 'construct-hub';

// The usual... you might have used `cdk init app` instead!
const app = new App();
const stack = new Stack(app, 'StackName', { /* ... */ });

// Now to business!
new ConstructHub(stack, 'ConstructHub', {
  backendDashboardName: 'ConstructHub-Backend'
});
```

This dashboard provides an overview of the most important process of the
ConstructHub instance, and can provide insight into the cause of many problem.

In addition to this, several alarms are automatically created by the
`ConstructHub` construct, that aim to inform operators about any problem. By
default no actions are configured on these alarms, but the `alarmActions`
property can be used to specify `IAlarmAction` instances to be bound to each
alarm:

```ts
import { SnsAction } from '@aws-cdk/aws-cloudwatch-actions';
import { Topic } from '@aws-cdk/aws-sns';
import { App, Stack } from '@aws-cdk/core';
import { ConstructHub } from 'construct-hub';

// The usual... you might have used `cdk init app` instead!
const app = new App();
const stack = new Stack(app, 'StackName', { /* ... */ });

// Now to business!
const emergencyTopic = new Topic(stack, 'Emergencies', { /* ... */ });
const informationTopic = new Topic(stack, 'Information', { /* ... */ });

new ConstructHub(stack, 'ConstructHub', {
  alarmActions: {
    // This action triggers when immediate attention is needed!
    highSeverityAction: new SnsAction(emergencyTopic),
    // This action triggers with less urgent alarms.
    normalSeverityAction: new SnsAction(informationTopic),
  },
});
```


## :raised_hand: Contributing

If you are looking to contribute to this project, but don't know where to start,
have a look at our [contributing guide](CONTRIBUTING.md)!


## :cop: Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more
information.


## :balance_scale: License

This project is licensed under the Apache-2.0 License.
