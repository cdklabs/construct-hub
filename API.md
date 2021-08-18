# API Reference <a name="API Reference"></a>

## Constructs <a name="Constructs"></a>

### ConstructHub <a name="construct-hub.ConstructHub"></a>

- *Implements:* [`@aws-cdk/aws-iam.IGrantable`](#@aws-cdk/aws-iam.IGrantable)

Construct Hub.

#### Initializer <a name="construct-hub.ConstructHub.Initializer"></a>

```typescript
import { ConstructHub } from 'construct-hub'

new ConstructHub(scope: Construct, id: string, props?: ConstructHubProps)
```

##### `scope`<sup>Required</sup> <a name="construct-hub.ConstructHub.parameter.scope"></a>

- *Type:* [`constructs.Construct`](#constructs.Construct)

---

##### `id`<sup>Required</sup> <a name="construct-hub.ConstructHub.parameter.id"></a>

- *Type:* `string`

---

##### `props`<sup>Optional</sup> <a name="construct-hub.ConstructHub.parameter.props"></a>

- *Type:* [`construct-hub.ConstructHubProps`](#construct-hub.ConstructHubProps)

---



#### Properties <a name="Properties"></a>

##### `grantPrincipal`<sup>Required</sup> <a name="construct-hub.ConstructHub.property.grantPrincipal"></a>

- *Type:* [`@aws-cdk/aws-iam.IPrincipal`](#@aws-cdk/aws-iam.IPrincipal)

The principal to grant permissions to.

---

##### `ingestionQueue`<sup>Required</sup> <a name="construct-hub.ConstructHub.property.ingestionQueue"></a>

- *Type:* [`@aws-cdk/aws-sqs.IQueue`](#@aws-cdk/aws-sqs.IQueue)

---


## Structs <a name="Structs"></a>

### AlarmActions <a name="construct-hub.AlarmActions"></a>

CloudWatch alarm actions to perform.

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { AlarmActions } from 'construct-hub'

const alarmActions: AlarmActions = { ... }
```

##### `highSeverity`<sup>Optional</sup> <a name="construct-hub.AlarmActions.property.highSeverity"></a>

- *Type:* `string`

The ARN of the CloudWatch alarm action to take for alarms of high-severity alarms.

This must be an ARN that can be used with CloudWatch alarms.

> https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions

---

##### `highSeverityAction`<sup>Optional</sup> <a name="construct-hub.AlarmActions.property.highSeverityAction"></a>

- *Type:* [`@aws-cdk/aws-cloudwatch.IAlarmAction`](#@aws-cdk/aws-cloudwatch.IAlarmAction)

The CloudWatch alarm action to take for alarms of high-severity alarms.

This must be an ARN that can be used with CloudWatch alarms.

> https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions

---

##### `normalSeverity`<sup>Optional</sup> <a name="construct-hub.AlarmActions.property.normalSeverity"></a>

- *Type:* `string`
- *Default:* no actions are taken in response to alarms of normal severity

The ARN of the CloudWatch alarm action to take for alarms of normal severity.

This must be an ARN that can be used with CloudWatch alarms.

> https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions

---

##### `normalSeverityAction`<sup>Optional</sup> <a name="construct-hub.AlarmActions.property.normalSeverityAction"></a>

- *Type:* [`@aws-cdk/aws-cloudwatch.IAlarmAction`](#@aws-cdk/aws-cloudwatch.IAlarmAction)
- *Default:* no actions are taken in response to alarms of normal severity

The CloudWatch alarm action to take for alarms of normal severity.

This must be an ARN that can be used with CloudWatch alarms.

> https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions

---

### ConstructHubProps <a name="construct-hub.ConstructHubProps"></a>

Props for `ConstructHub`.

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { ConstructHubProps } from 'construct-hub'

const constructHubProps: ConstructHubProps = { ... }
```

##### `alarmActions`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.alarmActions"></a>

- *Type:* [`construct-hub.AlarmActions`](#construct-hub.AlarmActions)

Actions to perform when alarms are set.

---

##### `backendDashboardName`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.backendDashboardName"></a>

- *Type:* `string`

The name of the CloudWatch dashboard that represents the health of backend systems.

---

##### `denyList`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.denyList"></a>

- *Type:* [`construct-hub.DenyListRule`](#construct-hub.DenyListRule)[]
- *Default:* []

A list of packages to block from the construct hub.

---

##### `domain`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.domain"></a>

- *Type:* [`construct-hub.Domain`](#construct-hub.Domain)

Connect the hub to a domain (requires a hosted zone and a certificate).

---

##### `isolateLambdas`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.isolateLambdas"></a>

- *Type:* `boolean`
- *Default:* true

Whether sensitive Lambda functions (which operate on un-trusted complex data, such as the transliterator, which operates with externally-sourced npm package tarballs) should run in network-isolated environments.

This
implies the creation of additonal resources, including:

- A VPC with only isolated subnets.
- VPC Endpoints (CodeArtifact, CodeArtifact API, S3)
- A CodeArtifact Repository with an external connection to npmjs.com

---

##### `packageSources`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.packageSources"></a>

- *Type:* [`construct-hub.IPackageSource`](#construct-hub.IPackageSource)[]
- *Default:* a standard npmjs.com package source will be configured.

The package sources to register with this ConstructHub instance.

---

### DenyListMap <a name="construct-hub.DenyListMap"></a>

The contents of the deny list file in S3.

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { DenyListMap } from 'construct-hub'

const denyListMap: DenyListMap = { ... }
```

### DenyListRule <a name="construct-hub.DenyListRule"></a>

An entry in the list of packages blocked from display in the construct hub.

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { DenyListRule } from 'construct-hub'

const denyListRule: DenyListRule = { ... }
```

##### `packageName`<sup>Required</sup> <a name="construct-hub.DenyListRule.property.packageName"></a>

- *Type:* `string`

The name of the package to block (npm).

---

##### `reason`<sup>Required</sup> <a name="construct-hub.DenyListRule.property.reason"></a>

- *Type:* `string`

The reason why this package/version is denied.

This information will be
emitted to the construct hub logs.

---

##### `version`<sup>Optional</sup> <a name="construct-hub.DenyListRule.property.version"></a>

- *Type:* `string`
- *Default:* all versions of this package are blocked.

The package version to block (must be a valid version such as "1.0.3").

---

### Domain <a name="construct-hub.Domain"></a>

Domain configuration for the website.

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { Domain } from 'construct-hub'

const domain: Domain = { ... }
```

##### `cert`<sup>Required</sup> <a name="construct-hub.Domain.property.cert"></a>

- *Type:* [`@aws-cdk/aws-certificatemanager.ICertificate`](#@aws-cdk/aws-certificatemanager.ICertificate)
- *Default:* a DNS-Validated certificate will be provisioned using the
  provided `hostedZone`.

The certificate to use for serving the Construct Hub over a custom domain.

---

##### `zone`<sup>Required</sup> <a name="construct-hub.Domain.property.zone"></a>

- *Type:* [`@aws-cdk/aws-route53.IHostedZone`](#@aws-cdk/aws-route53.IHostedZone)

The root domain name where this instance of Construct Hub will be served.

---

##### `monitorCertificateExpiration`<sup>Optional</sup> <a name="construct-hub.Domain.property.monitorCertificateExpiration"></a>

- *Type:* `boolean`
- *Default:* true

Whether the certificate should be monitored for expiration, meaning high severity alarms will be raised if it is due to expire in less than 45 days.

---

### LinkedResource <a name="construct-hub.LinkedResource"></a>

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { LinkedResource } from 'construct-hub'

const linkedResource: LinkedResource = { ... }
```

##### `name`<sup>Required</sup> <a name="construct-hub.LinkedResource.property.name"></a>

- *Type:* `string`

The name of the linked resource.

---

##### `url`<sup>Required</sup> <a name="construct-hub.LinkedResource.property.url"></a>

- *Type:* `string`

The URL where the linked resource can be found.

---

##### `primary`<sup>Optional</sup> <a name="construct-hub.LinkedResource.property.primary"></a>

- *Type:* `boolean`

Whether this is the primary resource of the bound package source.

It is not
necessary that there is one, and there could be multiple primary resources.
The buttons for those will be rendered with a different style on the
dashboard.

---

### PackageSourceBindOptions <a name="construct-hub.PackageSourceBindOptions"></a>

Options for binding a package source.

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { PackageSourceBindOptions } from 'construct-hub'

const packageSourceBindOptions: PackageSourceBindOptions = { ... }
```

##### `ingestion`<sup>Required</sup> <a name="construct-hub.PackageSourceBindOptions.property.ingestion"></a>

- *Type:* [`@aws-cdk/aws-iam.IGrantable`](#@aws-cdk/aws-iam.IGrantable)

The `IGrantable` that will process downstream messages from the bound package source.

It needs to be granted permissions to read package data
from the URLs sent to the `queue`.

---

##### `monitoring`<sup>Required</sup> <a name="construct-hub.PackageSourceBindOptions.property.monitoring"></a>

- *Type:* [`construct-hub.IMonitoring`](#construct-hub.IMonitoring)

The monitoring instance to use for registering alarms, etc.

---

##### `queue`<sup>Required</sup> <a name="construct-hub.PackageSourceBindOptions.property.queue"></a>

- *Type:* [`@aws-cdk/aws-sqs.IQueue`](#@aws-cdk/aws-sqs.IQueue)

The SQS queue to which messages should be sent.

Sent objects should match
the package discovery schema.

---

##### `denyList`<sup>Optional</sup> <a name="construct-hub.PackageSourceBindOptions.property.denyList"></a>

- *Type:* [`construct-hub.IDenyList`](#construct-hub.IDenyList)

The configured `DenyList` for the bound Construct Hub instance, if any.

---

##### `repository`<sup>Optional</sup> <a name="construct-hub.PackageSourceBindOptions.property.repository"></a>

- *Type:* [`construct-hub.IRepository`](#construct-hub.IRepository)

The CodeArtifact repository that is internally used by ConstructHub.

This
may be undefined if no CodeArtifact repository is internally used.

---

### PackageSourceBindResult <a name="construct-hub.PackageSourceBindResult"></a>

The result of binding a package source.

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { PackageSourceBindResult } from 'construct-hub'

const packageSourceBindResult: PackageSourceBindResult = { ... }
```

##### `dashboardWidgets`<sup>Required</sup> <a name="construct-hub.PackageSourceBindResult.property.dashboardWidgets"></a>

- *Type:* [`@aws-cdk/aws-cloudwatch.IWidget`](#@aws-cdk/aws-cloudwatch.IWidget)[][]

Widgets to add to the operator dashbaord for monitoring the health of the bound package source.

It is not necessary for this list of widgets to
include a title section (this will be added automatically). One array
represents a row of widgets on the dashboard.

---

##### `name`<sup>Required</sup> <a name="construct-hub.PackageSourceBindResult.property.name"></a>

- *Type:* `string`

The name of the bound package source.

It will be used to render operator
dashboards (so it should be a meaningful identification of the source).

---

##### `links`<sup>Optional</sup> <a name="construct-hub.PackageSourceBindResult.property.links"></a>

- *Type:* [`construct-hub.LinkedResource`](#construct-hub.LinkedResource)[]

An optional list of linked resources to be displayed on the monitoring dashboard.

---


## Protocols <a name="Protocols"></a>

### IDenyList <a name="construct-hub.IDenyList"></a>

- *Implemented By:* [`construct-hub.IDenyList`](#construct-hub.IDenyList)

DenyList features exposed to extension points.

#### Methods <a name="Methods"></a>

##### `grantRead` <a name="construct-hub.IDenyList.grantRead"></a>

```typescript
public grantRead(handler: Function)
```

###### `handler`<sup>Required</sup> <a name="construct-hub.IDenyList.parameter.handler"></a>

- *Type:* [`@aws-cdk/aws-lambda.Function`](#@aws-cdk/aws-lambda.Function)

---


### IMonitoring <a name="construct-hub.IMonitoring"></a>

- *Implemented By:* [`construct-hub.IMonitoring`](#construct-hub.IMonitoring)

ConstructHub monitoring features exposed to extension points.

#### Methods <a name="Methods"></a>

##### `addHighSeverityAlarm` <a name="construct-hub.IMonitoring.addHighSeverityAlarm"></a>

```typescript
public addHighSeverityAlarm(title: string, alarm: Alarm)
```

###### `title`<sup>Required</sup> <a name="construct-hub.IMonitoring.parameter.title"></a>

- *Type:* `string`

a user-friendly title for the alarm (will be rendered on the high-severity CloudWatch dashboard).

---

###### `alarm`<sup>Required</sup> <a name="construct-hub.IMonitoring.parameter.alarm"></a>

- *Type:* [`@aws-cdk/aws-cloudwatch.Alarm`](#@aws-cdk/aws-cloudwatch.Alarm)

the alarm to be added to the high-severity dashboard.

---


### IPackageSource <a name="construct-hub.IPackageSource"></a>

- *Implemented By:* [`construct-hub.sources.CodeArtifact`](#construct-hub.sources.CodeArtifact), [`construct-hub.sources.NpmJs`](#construct-hub.sources.NpmJs), [`construct-hub.IPackageSource`](#construct-hub.IPackageSource)

A package source for ConstructHub.

#### Methods <a name="Methods"></a>

##### `bind` <a name="construct-hub.IPackageSource.bind"></a>

```typescript
public bind(scope: Construct, opts: PackageSourceBindOptions)
```

###### `scope`<sup>Required</sup> <a name="construct-hub.IPackageSource.parameter.scope"></a>

- *Type:* [`@aws-cdk/core.Construct`](#@aws-cdk/core.Construct)

the construct scope in which the binding happens.

---

###### `opts`<sup>Required</sup> <a name="construct-hub.IPackageSource.parameter.opts"></a>

- *Type:* [`construct-hub.PackageSourceBindOptions`](#construct-hub.PackageSourceBindOptions)

options for binding the package source.

---


### IRepository <a name="construct-hub.IRepository"></a>

- *Implemented By:* [`construct-hub.IRepository`](#construct-hub.IRepository)

The CodeArtifact repository API exposed to extensions.

#### Methods <a name="Methods"></a>

##### `addExternalConnection` <a name="construct-hub.IRepository.addExternalConnection"></a>

```typescript
public addExternalConnection(id: string)
```

###### `id`<sup>Required</sup> <a name="construct-hub.IRepository.parameter.id"></a>

- *Type:* `string`

the id of the external connection (i.e: `public:npmjs`).

---


