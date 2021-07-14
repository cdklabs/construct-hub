# API Reference <a name="API Reference"></a>

## Constructs <a name="Constructs"></a>

### ConstructHub <a name="construct-hub.ConstructHub"></a>

- *Implements:* [`@aws-cdk/aws-iam.IGrantable`](#@aws-cdk/aws-iam.IGrantable)

Construct Hub.

#### Initializer <a name="construct-hub.ConstructHub.Initializer"></a>

```typescript
import { ConstructHub } from 'construct-hub'

new ConstructHub(scope: Construct, id: string, props: ConstructHubProps)
```

##### `scope`<sup>Required</sup> <a name="construct-hub.ConstructHub.scope"></a>

- *Type:* [`constructs.Construct`](#constructs.Construct)

---

##### `id`<sup>Required</sup> <a name="construct-hub.ConstructHub.id"></a>

- *Type:* `string`

---

##### `props`<sup>Required</sup> <a name="construct-hub.ConstructHub.props"></a>

- *Type:* [`construct-hub.ConstructHubProps`](#construct-hub.ConstructHubProps)

---



#### Properties <a name="Properties"></a>

##### `grantPrincipal`<sup>Required</sup> <a name="construct-hub.ConstructHub.grantPrincipal"></a>

- *Type:* [`@aws-cdk/aws-iam.IPrincipal`](#@aws-cdk/aws-iam.IPrincipal)

The principal to grant permissions to.

---

##### `ingestionQueue`<sup>Required</sup> <a name="construct-hub.ConstructHub.ingestionQueue"></a>

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

##### `highSeverity`<sup>Required</sup> <a name="construct-hub.AlarmActions.highSeverity"></a>

- *Type:* `string`

The ARN of the CloudWatch alarm action to take for alarms of high-severity alarms.

This must be an ARN that can be used with CloudWatch alarms.

> https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions

---

##### `normalSeverity`<sup>Optional</sup> <a name="construct-hub.AlarmActions.normalSeverity"></a>

- *Type:* `string`
- *Default:* no actions are taken in response to alarms of normal severity

The ARN of the CloudWatch alarm action to take for alarms of normal severity.

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

##### `alarmActions`<sup>Required</sup> <a name="construct-hub.ConstructHubProps.alarmActions"></a>

- *Type:* [`construct-hub.AlarmActions`](#construct-hub.AlarmActions)

Actions to perform when alarms are set.

---

##### `dashboardName`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.dashboardName"></a>

- *Type:* `string`
- *Default:* "construct-hub"

The name of the CloudWatch Dashboard created to observe this application.

Must only contain alphanumerics, dash (-) and underscore (_).

---

##### `denyList`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.denyList"></a>

- *Type:* [`construct-hub.DenyListEntry`](#construct-hub.DenyListEntry)[]
- *Default:* []

A list of packages to block from the construct hub.

---

##### `domain`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.domain"></a>

- *Type:* [`construct-hub.Domain`](#construct-hub.Domain)

Connect the hub to a domain (requires a hosted zone and a certificate).

---

<<<<<<< HEAD
### DenyListEntry <a name="construct-hub.DenyListEntry"></a>

An entry in the list of packages blocked from display in the construct hub.

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { DenyListEntry } from 'construct-hub'

const denyListEntry: DenyListEntry = { ... }
```

##### `packageName`<sup>Required</sup> <a name="construct-hub.DenyListEntry.packageName"></a>

- *Type:* `string`

The name of the package to block (npm).

---

##### `reason`<sup>Required</sup> <a name="construct-hub.DenyListEntry.reason"></a>

- *Type:* `string`

The reason why this package/version is denied.

This information will be
emitted to the construct hub logs.

---

##### `packageVersion`<sup>Optional</sup> <a name="construct-hub.DenyListEntry.packageVersion"></a>

- *Type:* `string`
- *Default:* all versions of this package are blocked.

The package version to block (must be a valid version such as "1.0.3").
=======
##### `isolateLambdas`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.isolateLambdas"></a>

- *Type:* `boolean`
- *Default:* true

Whether sensitive Lambda functions (which operate on un-trusted complex data, such as the transliterator, which operates with externally-sourced npm package tarballs) should run in network-isolated environments.

This
implies the creation of additonal resources, including:

- A VPC with only isolated subnets.
- VPC Endpoints (CodeArtifact, CodeArtifact API, S3)
- A CodeArtifact Repository with an external connection to npmjs.com
>>>>>>> origin/main

---

### Domain <a name="construct-hub.Domain"></a>

Domain configuration for the website.

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { Domain } from 'construct-hub'

const domain: Domain = { ... }
```

##### `cert`<sup>Required</sup> <a name="construct-hub.Domain.cert"></a>

- *Type:* [`@aws-cdk/aws-certificatemanager.ICertificate`](#@aws-cdk/aws-certificatemanager.ICertificate)
- *Default:* a DNS-Validated certificate will be provisioned using the
  provided `hostedZone`.

The certificate to use for serving the Construct Hub over a custom domain.

---

##### `zone`<sup>Required</sup> <a name="construct-hub.Domain.zone"></a>

- *Type:* [`@aws-cdk/aws-route53.IHostedZone`](#@aws-cdk/aws-route53.IHostedZone)

The root domain name where this instance of Construct Hub will be served.

---

##### `monitorCertificateExpiration`<sup>Optional</sup> <a name="construct-hub.Domain.monitorCertificateExpiration"></a>

- *Type:* `boolean`
- *Default:* true

Whether the certificate should be monitored for expiration, meaning high severity alarms will be raised if it is due to expire in less than 45 days.

---



