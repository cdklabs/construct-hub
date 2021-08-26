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

### CodeArtifactDomainProps <a name="construct-hub.CodeArtifactDomainProps"></a>

Information pertaining to an existing CodeArtifact Domain.

#### Initializer <a name="[object Object].Initializer"></a>

```typescript
import { CodeArtifactDomainProps } from 'construct-hub'

const codeArtifactDomainProps: CodeArtifactDomainProps = { ... }
```

##### `name`<sup>Required</sup> <a name="construct-hub.CodeArtifactDomainProps.property.name"></a>

- *Type:* `string`

The name of the CodeArtifact domain.

---

##### `upstreams`<sup>Optional</sup> <a name="construct-hub.CodeArtifactDomainProps.property.upstreams"></a>

- *Type:* `string`[]

Any upstream repositories in this CodeArtifact domain that should be configured on the internal CodeArtifact repository.

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

##### `allowedLicenses`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.allowedLicenses"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)[]
- *Default:* [...SpdxLicense.apache(),...SpdxLicense.bsd(),...SpdxLicense.mit()]

The allowed licenses for packages indexed by this instance of ConstructHub.

---

##### `backendDashboardName`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.backendDashboardName"></a>

- *Type:* `string`

The name of the CloudWatch dashboard that represents the health of backend systems.

---

##### `codeArtifactDomain`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.codeArtifactDomain"></a>

- *Type:* [`construct-hub.CodeArtifactDomainProps`](#construct-hub.CodeArtifactDomainProps)
- *Default:* none.

When using a CodeArtifact package source, it is often desirable to have ConstructHub provision it's internal CodeArtifact repository in the same CodeArtifact domain, and to configure the package source repository as an upstream of the internal repository.

This way, all packages in the source
are available to ConstructHub's backend processing.

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

##### `licenseList`<sup>Required</sup> <a name="construct-hub.PackageSourceBindOptions.property.licenseList"></a>

- *Type:* [`construct-hub.ILicenseList`](#construct-hub.ILicenseList)

The license list applied by the bound Construct Hub instance.

This can be
used to filter down the package only to those which will pass the license
filter.

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

## Classes <a name="Classes"></a>

### SpdxLicense <a name="construct-hub.SpdxLicense"></a>

Valid SPDX License identifiers.


#### Static Functions <a name="Static Functions"></a>

##### `all` <a name="construct-hub.SpdxLicense.all"></a>

```typescript
import { SpdxLicense } from 'construct-hub'

SpdxLicense.all()
```

##### `apache` <a name="construct-hub.SpdxLicense.apache"></a>

```typescript
import { SpdxLicense } from 'construct-hub'

SpdxLicense.apache()
```

##### `bsd` <a name="construct-hub.SpdxLicense.bsd"></a>

```typescript
import { SpdxLicense } from 'construct-hub'

SpdxLicense.bsd()
```

##### `mit` <a name="construct-hub.SpdxLicense.mit"></a>

```typescript
import { SpdxLicense } from 'construct-hub'

SpdxLicense.mit()
```

##### `osiApproved` <a name="construct-hub.SpdxLicense.osiApproved"></a>

```typescript
import { SpdxLicense } from 'construct-hub'

SpdxLicense.osiApproved()
```

#### Properties <a name="Properties"></a>

##### `id`<sup>Required</sup> <a name="construct-hub.SpdxLicense.property.id"></a>

- *Type:* `string`

---

#### Constants <a name="Constants"></a>

##### `AAL` <a name="construct-hub.SpdxLicense.property.AAL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Attribution Assurance License.

> https://opensource.org/licenses/attribution

---

##### `ABSTYLES` <a name="construct-hub.SpdxLicense.property.ABSTYLES"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Abstyles License.

> https://fedoraproject.org/wiki/Licensing/Abstyles

---

##### `ADOBE_2006` <a name="construct-hub.SpdxLicense.property.ADOBE_2006"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Adobe Systems Incorporated Source Code License Agreement.

> https://fedoraproject.org/wiki/Licensing/AdobeLicense

---

##### `ADOBE_GLYPH` <a name="construct-hub.SpdxLicense.property.ADOBE_GLYPH"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Adobe Glyph List License.

> https://fedoraproject.org/wiki/Licensing/MIT#AdobeGlyph

---

##### `ADSL` <a name="construct-hub.SpdxLicense.property.ADSL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Amazon Digital Services License.

> https://fedoraproject.org/wiki/Licensing/AmazonDigitalServicesLicense

---

##### `AFL_1_1` <a name="construct-hub.SpdxLicense.property.AFL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Academic Free License v1.1.

> http://opensource.linux-mirror.org/licenses/afl-1.1.txt

---

##### `AFL_1_2` <a name="construct-hub.SpdxLicense.property.AFL_1_2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Academic Free License v1.2.

> http://opensource.linux-mirror.org/licenses/afl-1.2.txt

---

##### `AFL_2_0` <a name="construct-hub.SpdxLicense.property.AFL_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Academic Free License v2.0.

> http://wayback.archive.org/web/20060924134533/http://www.opensource.org/licenses/afl-2.0.txt

---

##### `AFL_2_1` <a name="construct-hub.SpdxLicense.property.AFL_2_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Academic Free License v2.1.

> http://opensource.linux-mirror.org/licenses/afl-2.1.txt

---

##### `AFL_3_0` <a name="construct-hub.SpdxLicense.property.AFL_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Academic Free License v3.0.

> http://www.rosenlaw.com/AFL3.0.htm

---

##### `AFMPARSE` <a name="construct-hub.SpdxLicense.property.AFMPARSE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Afmparse License.

> https://fedoraproject.org/wiki/Licensing/Afmparse

---

##### `AGPL_1_0` <a name="construct-hub.SpdxLicense.property.AGPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Affero General Public License v1.0.

> http://www.affero.org/oagpl.html

---

##### `AGPL_1_0_ONLY` <a name="construct-hub.SpdxLicense.property.AGPL_1_0_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Affero General Public License v1.0 only.

> http://www.affero.org/oagpl.html

---

##### `AGPL_1_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.AGPL_1_0_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Affero General Public License v1.0 or later.

> http://www.affero.org/oagpl.html

---

##### `AGPL_3_0` <a name="construct-hub.SpdxLicense.property.AGPL_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Affero General Public License v3.0.

> https://www.gnu.org/licenses/agpl.txt

---

##### `AGPL_3_0_ONLY` <a name="construct-hub.SpdxLicense.property.AGPL_3_0_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Affero General Public License v3.0 only.

> https://www.gnu.org/licenses/agpl.txt

---

##### `AGPL_3_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.AGPL_3_0_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Affero General Public License v3.0 or later.

> https://www.gnu.org/licenses/agpl.txt

---

##### `ALADDIN` <a name="construct-hub.SpdxLicense.property.ALADDIN"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Aladdin Free Public License.

> http://pages.cs.wisc.edu/~ghost/doc/AFPL/6.01/Public.htm

---

##### `AMDPLPA` <a name="construct-hub.SpdxLicense.property.AMDPLPA"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

AMD's plpa_map.c License.

> https://fedoraproject.org/wiki/Licensing/AMD_plpa_map_License

---

##### `AML` <a name="construct-hub.SpdxLicense.property.AML"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apple MIT License.

> https://fedoraproject.org/wiki/Licensing/Apple_MIT_License

---

##### `AMPAS` <a name="construct-hub.SpdxLicense.property.AMPAS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Academy of Motion Picture Arts and Sciences BSD.

> https://fedoraproject.org/wiki/Licensing/BSD#AMPASBSD

---

##### `ANTLR_PD` <a name="construct-hub.SpdxLicense.property.ANTLR_PD"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ANTLR Software Rights Notice.

> http://www.antlr2.org/license.html

---

##### `ANTLR_PD_FALLBACK` <a name="construct-hub.SpdxLicense.property.ANTLR_PD_FALLBACK"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ANTLR Software Rights Notice with license fallback.

> http://www.antlr2.org/license.html

---

##### `APACHE_1_0` <a name="construct-hub.SpdxLicense.property.APACHE_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apache License 1.0.

> http://www.apache.org/licenses/LICENSE-1.0

---

##### `APACHE_1_1` <a name="construct-hub.SpdxLicense.property.APACHE_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apache License 1.1.

> http://apache.org/licenses/LICENSE-1.1

---

##### `APACHE_2_0` <a name="construct-hub.SpdxLicense.property.APACHE_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apache License 2.0.

> http://www.apache.org/licenses/LICENSE-2.0

---

##### `APAFML` <a name="construct-hub.SpdxLicense.property.APAFML"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Adobe Postscript AFM License.

> https://fedoraproject.org/wiki/Licensing/AdobePostscriptAFM

---

##### `APL_1_0` <a name="construct-hub.SpdxLicense.property.APL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Adaptive Public License 1.0.

> https://opensource.org/licenses/APL-1.0

---

##### `APSL_1_0` <a name="construct-hub.SpdxLicense.property.APSL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apple Public Source License 1.0.

> https://fedoraproject.org/wiki/Licensing/Apple_Public_Source_License_1.0

---

##### `APSL_1_1` <a name="construct-hub.SpdxLicense.property.APSL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apple Public Source License 1.1.

> http://www.opensource.apple.com/source/IOSerialFamily/IOSerialFamily-7/APPLE_LICENSE

---

##### `APSL_1_2` <a name="construct-hub.SpdxLicense.property.APSL_1_2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apple Public Source License 1.2.

> http://www.samurajdata.se/opensource/mirror/licenses/apsl.php

---

##### `APSL_2_0` <a name="construct-hub.SpdxLicense.property.APSL_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apple Public Source License 2.0.

> http://www.opensource.apple.com/license/apsl/

---

##### `ARTISTIC_1_0` <a name="construct-hub.SpdxLicense.property.ARTISTIC_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Artistic License 1.0.

> https://opensource.org/licenses/Artistic-1.0

---

##### `ARTISTIC_1_0_CL8` <a name="construct-hub.SpdxLicense.property.ARTISTIC_1_0_CL8"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Artistic License 1.0 w/clause 8.

> https://opensource.org/licenses/Artistic-1.0

---

##### `ARTISTIC_1_0_PERL` <a name="construct-hub.SpdxLicense.property.ARTISTIC_1_0_PERL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Artistic License 1.0 (Perl).

> http://dev.perl.org/licenses/artistic.html

---

##### `ARTISTIC_2_0` <a name="construct-hub.SpdxLicense.property.ARTISTIC_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Artistic License 2.0.

> http://www.perlfoundation.org/artistic_license_2_0

---

##### `BAHYPH` <a name="construct-hub.SpdxLicense.property.BAHYPH"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Bahyph License.

> https://fedoraproject.org/wiki/Licensing/Bahyph

---

##### `BARR` <a name="construct-hub.SpdxLicense.property.BARR"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Barr License.

> https://fedoraproject.org/wiki/Licensing/Barr

---

##### `BEERWARE` <a name="construct-hub.SpdxLicense.property.BEERWARE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Beerware License.

> https://fedoraproject.org/wiki/Licensing/Beerware

---

##### `BITTORRENT_1_0` <a name="construct-hub.SpdxLicense.property.BITTORRENT_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BitTorrent Open Source License v1.0.

> http://sources.gentoo.org/cgi-bin/viewvc.cgi/gentoo-x86/licenses/BitTorrent?r1=1.1&r2=1.1.1.1&diff_format=s

---

##### `BITTORRENT_1_1` <a name="construct-hub.SpdxLicense.property.BITTORRENT_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BitTorrent Open Source License v1.1.

> http://directory.fsf.org/wiki/License:BitTorrentOSL1.1

---

##### `BLESSING` <a name="construct-hub.SpdxLicense.property.BLESSING"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SQLite Blessing.

> https://www.sqlite.org/src/artifact/e33a4df7e32d742a?ln=4-9

---

##### `BLUEOAK_1_0_0` <a name="construct-hub.SpdxLicense.property.BLUEOAK_1_0_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Blue Oak Model License 1.0.0.

> https://blueoakcouncil.org/license/1.0.0

---

##### `BORCEUX` <a name="construct-hub.SpdxLicense.property.BORCEUX"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Borceux license.

> https://fedoraproject.org/wiki/Licensing/Borceux

---

##### `BSD_1_CLAUSE` <a name="construct-hub.SpdxLicense.property.BSD_1_CLAUSE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 1-Clause License.

> https://svnweb.freebsd.org/base/head/include/ifaddrs.h?revision=326823

---

##### `BSD_2_CLAUSE` <a name="construct-hub.SpdxLicense.property.BSD_2_CLAUSE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 2-Clause "Simplified" License.

> https://opensource.org/licenses/BSD-2-Clause

---

##### `BSD_2_CLAUSE_FREEBSD` <a name="construct-hub.SpdxLicense.property.BSD_2_CLAUSE_FREEBSD"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 2-Clause FreeBSD License.

> http://www.freebsd.org/copyright/freebsd-license.html

---

##### `BSD_2_CLAUSE_NETBSD` <a name="construct-hub.SpdxLicense.property.BSD_2_CLAUSE_NETBSD"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 2-Clause NetBSD License.

> http://www.netbsd.org/about/redistribution.html#default

---

##### `BSD_2_CLAUSE_PATENT` <a name="construct-hub.SpdxLicense.property.BSD_2_CLAUSE_PATENT"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD-2-Clause Plus Patent License.

> https://opensource.org/licenses/BSDplusPatent

---

##### `BSD_2_CLAUSE_VIEWS` <a name="construct-hub.SpdxLicense.property.BSD_2_CLAUSE_VIEWS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 2-Clause with views sentence.

> http://www.freebsd.org/copyright/freebsd-license.html

---

##### `BSD_3_CLAUSE` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 3-Clause "New" or "Revised" License.

> https://opensource.org/licenses/BSD-3-Clause

---

##### `BSD_3_CLAUSE_ATTRIBUTION` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_ATTRIBUTION"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD with attribution.

> https://fedoraproject.org/wiki/Licensing/BSD_with_Attribution

---

##### `BSD_3_CLAUSE_CLEAR` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_CLEAR"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 3-Clause Clear License.

> http://labs.metacarta.com/license-explanation.html#license

---

##### `BSD_3_CLAUSE_LBNL` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_LBNL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Lawrence Berkeley National Labs BSD variant license.

> https://fedoraproject.org/wiki/Licensing/LBNLBSD

---

##### `BSD_3_CLAUSE_NO_NUCLEAR_LICENSE` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_NO_NUCLEAR_LICENSE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 3-Clause No Nuclear License.

> http://download.oracle.com/otn-pub/java/licenses/bsd.txt?AuthParam=1467140197_43d516ce1776bd08a58235a7785be1cc

---

##### `BSD_3_CLAUSE_NO_NUCLEAR_LICENSE_2014` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_NO_NUCLEAR_LICENSE_2014"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 3-Clause No Nuclear License 2014.

> https://java.net/projects/javaeetutorial/pages/BerkeleyLicense

---

##### `BSD_3_CLAUSE_NO_NUCLEAR_WARRANTY` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_NO_NUCLEAR_WARRANTY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 3-Clause No Nuclear Warranty.

> https://jogamp.org/git/?p=gluegen.git;a=blob_plain;f=LICENSE.txt

---

##### `BSD_3_CLAUSE_OPEN_MPI` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_OPEN_MPI"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 3-Clause Open MPI variant.

> https://www.open-mpi.org/community/license.php

---

##### `BSD_4_CLAUSE` <a name="construct-hub.SpdxLicense.property.BSD_4_CLAUSE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 4-Clause "Original" or "Old" License.

> http://directory.fsf.org/wiki/License:BSD_4Clause

---

##### `BSD_4_CLAUSE_UC` <a name="construct-hub.SpdxLicense.property.BSD_4_CLAUSE_UC"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD-4-Clause (University of California-Specific).

> http://www.freebsd.org/copyright/license.html

---

##### `BSD_PROTECTION` <a name="construct-hub.SpdxLicense.property.BSD_PROTECTION"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD Protection License.

> https://fedoraproject.org/wiki/Licensing/BSD_Protection_License

---

##### `BSD_SOURCE_CODE` <a name="construct-hub.SpdxLicense.property.BSD_SOURCE_CODE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD Source Code Attribution.

> https://github.com/robbiehanson/CocoaHTTPServer/blob/master/LICENSE.txt

---

##### `BSL_1_0` <a name="construct-hub.SpdxLicense.property.BSL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Boost Software License 1.0.

> http://www.boost.org/LICENSE_1_0.txt

---

##### `BUSL_1_1` <a name="construct-hub.SpdxLicense.property.BUSL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Business Source License 1.1.

> https://mariadb.com/bsl11/

---

##### `BZIP2_1_0_5` <a name="construct-hub.SpdxLicense.property.BZIP2_1_0_5"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

bzip2 and libbzip2 License v1.0.5.

> https://sourceware.org/bzip2/1.0.5/bzip2-manual-1.0.5.html

---

##### `BZIP2_1_0_6` <a name="construct-hub.SpdxLicense.property.BZIP2_1_0_6"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

bzip2 and libbzip2 License v1.0.6.

> https://sourceware.org/git/?p=bzip2.git;a=blob;f=LICENSE;hb=bzip2-1.0.6

---

##### `CAL_1_0` <a name="construct-hub.SpdxLicense.property.CAL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Cryptographic Autonomy License 1.0.

> http://cryptographicautonomylicense.com/license-text.html

---

##### `CAL_1_0_COMBINED_WORK_EXCEPTION` <a name="construct-hub.SpdxLicense.property.CAL_1_0_COMBINED_WORK_EXCEPTION"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Cryptographic Autonomy License 1.0 (Combined Work Exception).

> http://cryptographicautonomylicense.com/license-text.html

---

##### `CALDERA` <a name="construct-hub.SpdxLicense.property.CALDERA"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Caldera License.

> http://www.lemis.com/grog/UNIX/ancient-source-all.pdf

---

##### `CATOSL_1_1` <a name="construct-hub.SpdxLicense.property.CATOSL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Computer Associates Trusted Open Source License 1.1.

> https://opensource.org/licenses/CATOSL-1.1

---

##### `CC_BY_1_0` <a name="construct-hub.SpdxLicense.property.CC_BY_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 1.0 Generic.

> https://creativecommons.org/licenses/by/1.0/legalcode

---

##### `CC_BY_2_0` <a name="construct-hub.SpdxLicense.property.CC_BY_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 2.0 Generic.

> https://creativecommons.org/licenses/by/2.0/legalcode

---

##### `CC_BY_2_5` <a name="construct-hub.SpdxLicense.property.CC_BY_2_5"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 2.5 Generic.

> https://creativecommons.org/licenses/by/2.5/legalcode

---

##### `CC_BY_3_0` <a name="construct-hub.SpdxLicense.property.CC_BY_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 3.0 Unported.

> https://creativecommons.org/licenses/by/3.0/legalcode

---

##### `CC_BY_3_0_AT` <a name="construct-hub.SpdxLicense.property.CC_BY_3_0_AT"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 3.0 Austria.

> https://creativecommons.org/licenses/by/3.0/at/legalcode

---

##### `CC_BY_3_0_US` <a name="construct-hub.SpdxLicense.property.CC_BY_3_0_US"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 3.0 United States.

> https://creativecommons.org/licenses/by/3.0/us/legalcode

---

##### `CC_BY_4_0` <a name="construct-hub.SpdxLicense.property.CC_BY_4_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 4.0 International.

> https://creativecommons.org/licenses/by/4.0/legalcode

---

##### `CC_BY_NC_1_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial 1.0 Generic.

> https://creativecommons.org/licenses/by-nc/1.0/legalcode

---

##### `CC_BY_NC_2_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial 2.0 Generic.

> https://creativecommons.org/licenses/by-nc/2.0/legalcode

---

##### `CC_BY_NC_2_5` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_2_5"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial 2.5 Generic.

> https://creativecommons.org/licenses/by-nc/2.5/legalcode

---

##### `CC_BY_NC_3_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial 3.0 Unported.

> https://creativecommons.org/licenses/by-nc/3.0/legalcode

---

##### `CC_BY_NC_4_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_4_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial 4.0 International.

> https://creativecommons.org/licenses/by-nc/4.0/legalcode

---

##### `CC_BY_NC_ND_1_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_ND_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial No Derivatives 1.0 Generic.

> https://creativecommons.org/licenses/by-nd-nc/1.0/legalcode

---

##### `CC_BY_NC_ND_2_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_ND_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial No Derivatives 2.0 Generic.

> https://creativecommons.org/licenses/by-nc-nd/2.0/legalcode

---

##### `CC_BY_NC_ND_2_5` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_ND_2_5"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial No Derivatives 2.5 Generic.

> https://creativecommons.org/licenses/by-nc-nd/2.5/legalcode

---

##### `CC_BY_NC_ND_3_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_ND_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial No Derivatives 3.0 Unported.

> https://creativecommons.org/licenses/by-nc-nd/3.0/legalcode

---

##### `CC_BY_NC_ND_3_0_IGO` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_ND_3_0_IGO"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial No Derivatives 3.0 IGO.

> https://creativecommons.org/licenses/by-nc-nd/3.0/igo/legalcode

---

##### `CC_BY_NC_ND_4_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_ND_4_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial No Derivatives 4.0 International.

> https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode

---

##### `CC_BY_NC_SA_1_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_SA_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial Share Alike 1.0 Generic.

> https://creativecommons.org/licenses/by-nc-sa/1.0/legalcode

---

##### `CC_BY_NC_SA_2_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_SA_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial Share Alike 2.0 Generic.

> https://creativecommons.org/licenses/by-nc-sa/2.0/legalcode

---

##### `CC_BY_NC_SA_2_5` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_SA_2_5"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial Share Alike 2.5 Generic.

> https://creativecommons.org/licenses/by-nc-sa/2.5/legalcode

---

##### `CC_BY_NC_SA_3_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_SA_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial Share Alike 3.0 Unported.

> https://creativecommons.org/licenses/by-nc-sa/3.0/legalcode

---

##### `CC_BY_NC_SA_4_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_SA_4_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial Share Alike 4.0 International.

> https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode

---

##### `CC_BY_ND_1_0` <a name="construct-hub.SpdxLicense.property.CC_BY_ND_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution No Derivatives 1.0 Generic.

> https://creativecommons.org/licenses/by-nd/1.0/legalcode

---

##### `CC_BY_ND_2_0` <a name="construct-hub.SpdxLicense.property.CC_BY_ND_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution No Derivatives 2.0 Generic.

> https://creativecommons.org/licenses/by-nd/2.0/legalcode

---

##### `CC_BY_ND_2_5` <a name="construct-hub.SpdxLicense.property.CC_BY_ND_2_5"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution No Derivatives 2.5 Generic.

> https://creativecommons.org/licenses/by-nd/2.5/legalcode

---

##### `CC_BY_ND_3_0` <a name="construct-hub.SpdxLicense.property.CC_BY_ND_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution No Derivatives 3.0 Unported.

> https://creativecommons.org/licenses/by-nd/3.0/legalcode

---

##### `CC_BY_ND_4_0` <a name="construct-hub.SpdxLicense.property.CC_BY_ND_4_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution No Derivatives 4.0 International.

> https://creativecommons.org/licenses/by-nd/4.0/legalcode

---

##### `CC_BY_SA_1_0` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Share Alike 1.0 Generic.

> https://creativecommons.org/licenses/by-sa/1.0/legalcode

---

##### `CC_BY_SA_2_0` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Share Alike 2.0 Generic.

> https://creativecommons.org/licenses/by-sa/2.0/legalcode

---

##### `CC_BY_SA_2_0_UK` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_2_0_UK"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Share Alike 2.0 England and Wales.

> https://creativecommons.org/licenses/by-sa/2.0/uk/legalcode

---

##### `CC_BY_SA_2_5` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_2_5"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Share Alike 2.5 Generic.

> https://creativecommons.org/licenses/by-sa/2.5/legalcode

---

##### `CC_BY_SA_3_0` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Share Alike 3.0 Unported.

> https://creativecommons.org/licenses/by-sa/3.0/legalcode

---

##### `CC_BY_SA_3_0_AT` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_3_0_AT"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution-Share Alike 3.0 Austria.

> https://creativecommons.org/licenses/by-sa/3.0/at/legalcode

---

##### `CC_BY_SA_4_0` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_4_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Share Alike 4.0 International.

> https://creativecommons.org/licenses/by-sa/4.0/legalcode

---

##### `CC_PDDC` <a name="construct-hub.SpdxLicense.property.CC_PDDC"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Public Domain Dedication and Certification.

> https://creativecommons.org/licenses/publicdomain/

---

##### `CC0_1_0` <a name="construct-hub.SpdxLicense.property.CC0_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Zero v1.0 Universal.

> https://creativecommons.org/publicdomain/zero/1.0/legalcode

---

##### `CDDL_1_0` <a name="construct-hub.SpdxLicense.property.CDDL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Common Development and Distribution License 1.0.

> https://opensource.org/licenses/cddl1

---

##### `CDDL_1_1` <a name="construct-hub.SpdxLicense.property.CDDL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Common Development and Distribution License 1.1.

> http://glassfish.java.net/public/CDDL+GPL_1_1.html

---

##### `CDLA_PERMISSIVE_1_0` <a name="construct-hub.SpdxLicense.property.CDLA_PERMISSIVE_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Community Data License Agreement Permissive 1.0.

> https://cdla.io/permissive-1-0

---

##### `CDLA_SHARING_1_0` <a name="construct-hub.SpdxLicense.property.CDLA_SHARING_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Community Data License Agreement Sharing 1.0.

> https://cdla.io/sharing-1-0

---

##### `CECILL_1_0` <a name="construct-hub.SpdxLicense.property.CECILL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CeCILL Free Software License Agreement v1.0.

> http://www.cecill.info/licences/Licence_CeCILL_V1-fr.html

---

##### `CECILL_1_1` <a name="construct-hub.SpdxLicense.property.CECILL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CeCILL Free Software License Agreement v1.1.

> http://www.cecill.info/licences/Licence_CeCILL_V1.1-US.html

---

##### `CECILL_2_0` <a name="construct-hub.SpdxLicense.property.CECILL_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CeCILL Free Software License Agreement v2.0.

> http://www.cecill.info/licences/Licence_CeCILL_V2-en.html

---

##### `CECILL_2_1` <a name="construct-hub.SpdxLicense.property.CECILL_2_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CeCILL Free Software License Agreement v2.1.

> http://www.cecill.info/licences/Licence_CeCILL_V2.1-en.html

---

##### `CECILL_B` <a name="construct-hub.SpdxLicense.property.CECILL_B"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CeCILL-B Free Software License Agreement.

> http://www.cecill.info/licences/Licence_CeCILL-B_V1-en.html

---

##### `CECILL_C` <a name="construct-hub.SpdxLicense.property.CECILL_C"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CeCILL-C Free Software License Agreement.

> http://www.cecill.info/licences/Licence_CeCILL-C_V1-en.html

---

##### `CERN_OHL_1_1` <a name="construct-hub.SpdxLicense.property.CERN_OHL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CERN Open Hardware Licence v1.1.

> https://www.ohwr.org/project/licenses/wikis/cern-ohl-v1.1

---

##### `CERN_OHL_1_2` <a name="construct-hub.SpdxLicense.property.CERN_OHL_1_2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CERN Open Hardware Licence v1.2.

> https://www.ohwr.org/project/licenses/wikis/cern-ohl-v1.2

---

##### `CERN_OHL_P_2_0` <a name="construct-hub.SpdxLicense.property.CERN_OHL_P_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CERN Open Hardware Licence Version 2 - Permissive.

> https://www.ohwr.org/project/cernohl/wikis/Documents/CERN-OHL-version-2

---

##### `CERN_OHL_S_2_0` <a name="construct-hub.SpdxLicense.property.CERN_OHL_S_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CERN Open Hardware Licence Version 2 - Strongly Reciprocal.

> https://www.ohwr.org/project/cernohl/wikis/Documents/CERN-OHL-version-2

---

##### `CERN_OHL_W_2_0` <a name="construct-hub.SpdxLicense.property.CERN_OHL_W_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CERN Open Hardware Licence Version 2 - Weakly Reciprocal.

> https://www.ohwr.org/project/cernohl/wikis/Documents/CERN-OHL-version-2

---

##### `CL_ARTISTIC` <a name="construct-hub.SpdxLicense.property.CL_ARTISTIC"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Clarified Artistic License.

> http://gianluca.dellavedova.org/2011/01/03/clarified-artistic-license/

---

##### `CNRI_JYTHON` <a name="construct-hub.SpdxLicense.property.CNRI_JYTHON"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CNRI Jython License.

> http://www.jython.org/license.html

---

##### `CNRI_PYTHON` <a name="construct-hub.SpdxLicense.property.CNRI_PYTHON"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CNRI Python License.

> https://opensource.org/licenses/CNRI-Python

---

##### `CNRI_PYTHON_GPL_COMPATIBLE` <a name="construct-hub.SpdxLicense.property.CNRI_PYTHON_GPL_COMPATIBLE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CNRI Python Open Source GPL Compatible License Agreement.

> http://www.python.org/download/releases/1.6.1/download_win/

---

##### `CONDOR_1_1` <a name="construct-hub.SpdxLicense.property.CONDOR_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Condor Public License v1.1.

> http://research.cs.wisc.edu/condor/license.html#condor

---

##### `COPYLEFT_NEXT_0_3_0` <a name="construct-hub.SpdxLicense.property.COPYLEFT_NEXT_0_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

copyleft-next 0.3.0.

> https://github.com/copyleft-next/copyleft-next/blob/master/Releases/copyleft-next-0.3.0

---

##### `COPYLEFT_NEXT_0_3_1` <a name="construct-hub.SpdxLicense.property.COPYLEFT_NEXT_0_3_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

copyleft-next 0.3.1.

> https://github.com/copyleft-next/copyleft-next/blob/master/Releases/copyleft-next-0.3.1

---

##### `CPAL_1_0` <a name="construct-hub.SpdxLicense.property.CPAL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Common Public Attribution License 1.0.

> https://opensource.org/licenses/CPAL-1.0

---

##### `CPL_1_0` <a name="construct-hub.SpdxLicense.property.CPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Common Public License 1.0.

> https://opensource.org/licenses/CPL-1.0

---

##### `CPOL_1_02` <a name="construct-hub.SpdxLicense.property.CPOL_1_02"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Code Project Open License 1.02.

> http://www.codeproject.com/info/cpol10.aspx

---

##### `CROSSWORD` <a name="construct-hub.SpdxLicense.property.CROSSWORD"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Crossword License.

> https://fedoraproject.org/wiki/Licensing/Crossword

---

##### `CRYSTAL_STACKER` <a name="construct-hub.SpdxLicense.property.CRYSTAL_STACKER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CrystalStacker License.

> https://fedoraproject.org/wiki/Licensing:CrystalStacker?rd=Licensing/CrystalStacker

---

##### `CUA_OPL_1_0` <a name="construct-hub.SpdxLicense.property.CUA_OPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CUA Office Public License v1.0.

> https://opensource.org/licenses/CUA-OPL-1.0

---

##### `CUBE` <a name="construct-hub.SpdxLicense.property.CUBE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Cube License.

> https://fedoraproject.org/wiki/Licensing/Cube

---

##### `CURL` <a name="construct-hub.SpdxLicense.property.CURL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

curl License.

> https://github.com/bagder/curl/blob/master/COPYING

---

##### `D_FSL_1_0` <a name="construct-hub.SpdxLicense.property.D_FSL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Deutsche Freie Software Lizenz.

> http://www.dipp.nrw.de/d-fsl/lizenzen/

---

##### `DIFFMARK` <a name="construct-hub.SpdxLicense.property.DIFFMARK"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

diffmark license.

> https://fedoraproject.org/wiki/Licensing/diffmark

---

##### `DOC` <a name="construct-hub.SpdxLicense.property.DOC"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

DOC License.

> http://www.cs.wustl.edu/~schmidt/ACE-copying.html

---

##### `DOTSEQN` <a name="construct-hub.SpdxLicense.property.DOTSEQN"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Dotseqn License.

> https://fedoraproject.org/wiki/Licensing/Dotseqn

---

##### `DSDP` <a name="construct-hub.SpdxLicense.property.DSDP"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

DSDP License.

> https://fedoraproject.org/wiki/Licensing/DSDP

---

##### `DVIPDFM` <a name="construct-hub.SpdxLicense.property.DVIPDFM"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

dvipdfm License.

> https://fedoraproject.org/wiki/Licensing/dvipdfm

---

##### `E_GENIX` <a name="construct-hub.SpdxLicense.property.E_GENIX"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

eGenix.com Public License 1.1.0.

> http://www.egenix.com/products/eGenix.com-Public-License-1.1.0.pdf

---

##### `ECL_1_0` <a name="construct-hub.SpdxLicense.property.ECL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Educational Community License v1.0.

> https://opensource.org/licenses/ECL-1.0

---

##### `ECL_2_0` <a name="construct-hub.SpdxLicense.property.ECL_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Educational Community License v2.0.

> https://opensource.org/licenses/ECL-2.0

---

##### `ECOS_2_0` <a name="construct-hub.SpdxLicense.property.ECOS_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

eCos license version 2.0.

> https://www.gnu.org/licenses/ecos-license.html

---

##### `EFL_1_0` <a name="construct-hub.SpdxLicense.property.EFL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Eiffel Forum License v1.0.

> http://www.eiffel-nice.org/license/forum.txt

---

##### `EFL_2_0` <a name="construct-hub.SpdxLicense.property.EFL_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Eiffel Forum License v2.0.

> http://www.eiffel-nice.org/license/eiffel-forum-license-2.html

---

##### `ENTESSA` <a name="construct-hub.SpdxLicense.property.ENTESSA"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Entessa Public License v1.0.

> https://opensource.org/licenses/Entessa

---

##### `EPICS` <a name="construct-hub.SpdxLicense.property.EPICS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

EPICS Open License.

> https://epics.anl.gov/license/open.php

---

##### `EPL_1_0` <a name="construct-hub.SpdxLicense.property.EPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Eclipse Public License 1.0.

> http://www.eclipse.org/legal/epl-v10.html

---

##### `EPL_2_0` <a name="construct-hub.SpdxLicense.property.EPL_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Eclipse Public License 2.0.

> https://www.eclipse.org/legal/epl-2.0

---

##### `ERLPL_1_1` <a name="construct-hub.SpdxLicense.property.ERLPL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Erlang Public License v1.1.

> http://www.erlang.org/EPLICENSE

---

##### `ETALAB_2_0` <a name="construct-hub.SpdxLicense.property.ETALAB_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Etalab Open License 2.0.

> https://github.com/DISIC/politique-de-contribution-open-source/blob/master/LICENSE.pdf

---

##### `EUDATAGRID` <a name="construct-hub.SpdxLicense.property.EUDATAGRID"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

EU DataGrid Software License.

> http://eu-datagrid.web.cern.ch/eu-datagrid/license.html

---

##### `EUPL_1_0` <a name="construct-hub.SpdxLicense.property.EUPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

European Union Public License 1.0.

> http://ec.europa.eu/idabc/en/document/7330.html

---

##### `EUPL_1_1` <a name="construct-hub.SpdxLicense.property.EUPL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

European Union Public License 1.1.

> https://joinup.ec.europa.eu/software/page/eupl/licence-eupl

---

##### `EUPL_1_2` <a name="construct-hub.SpdxLicense.property.EUPL_1_2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

European Union Public License 1.2.

> https://joinup.ec.europa.eu/page/eupl-text-11-12

---

##### `EUROSYM` <a name="construct-hub.SpdxLicense.property.EUROSYM"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Eurosym License.

> https://fedoraproject.org/wiki/Licensing/Eurosym

---

##### `FAIR` <a name="construct-hub.SpdxLicense.property.FAIR"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Fair License.

> http://fairlicense.org/

---

##### `FRAMEWORX_1_0` <a name="construct-hub.SpdxLicense.property.FRAMEWORX_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Frameworx Open License 1.0.

> https://opensource.org/licenses/Frameworx-1.0

---

##### `FREE_IMAGE` <a name="construct-hub.SpdxLicense.property.FREE_IMAGE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

FreeImage Public License v1.0.

> http://freeimage.sourceforge.net/freeimage-license.txt

---

##### `FSFAP` <a name="construct-hub.SpdxLicense.property.FSFAP"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

FSF All Permissive License.

> https://www.gnu.org/prep/maintain/html_node/License-Notices-for-Other-Files.html

---

##### `FSFUL` <a name="construct-hub.SpdxLicense.property.FSFUL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

FSF Unlimited License.

> https://fedoraproject.org/wiki/Licensing/FSF_Unlimited_License

---

##### `FSFULLR` <a name="construct-hub.SpdxLicense.property.FSFULLR"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

FSF Unlimited License (with License Retention).

> https://fedoraproject.org/wiki/Licensing/FSF_Unlimited_License#License_Retention_Variant

---

##### `FTL` <a name="construct-hub.SpdxLicense.property.FTL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Freetype Project License.

> http://freetype.fis.uniroma2.it/FTL.TXT

---

##### `GFDL_1_1` <a name="construct-hub.SpdxLicense.property.GFDL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_1_INVARIANTS_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_1_INVARIANTS_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1 only - invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_1_INVARIANTS_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_1_INVARIANTS_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1 or later - invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_1_NO_INVARIANTS_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_1_NO_INVARIANTS_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1 only - no invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_1_NO_INVARIANTS_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_1_NO_INVARIANTS_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1 or later - no invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_1_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_1_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1 only.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_1_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_1_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1 or later.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_2` <a name="construct-hub.SpdxLicense.property.GFDL_1_2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_2_INVARIANTS_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_2_INVARIANTS_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2 only - invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_2_INVARIANTS_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_2_INVARIANTS_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2 or later - invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_2_NO_INVARIANTS_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_2_NO_INVARIANTS_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2 only - no invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_2_NO_INVARIANTS_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_2_NO_INVARIANTS_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2 or later - no invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_2_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_2_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2 only.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_2_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_2_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2 or later.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_3` <a name="construct-hub.SpdxLicense.property.GFDL_1_3"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GFDL_1_3_INVARIANTS_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_3_INVARIANTS_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3 only - invariants.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GFDL_1_3_INVARIANTS_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_3_INVARIANTS_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3 or later - invariants.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GFDL_1_3_NO_INVARIANTS_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_3_NO_INVARIANTS_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3 only - no invariants.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GFDL_1_3_NO_INVARIANTS_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_3_NO_INVARIANTS_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3 or later - no invariants.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GFDL_1_3_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_3_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3 only.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GFDL_1_3_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_3_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3 or later.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GIFTWARE` <a name="construct-hub.SpdxLicense.property.GIFTWARE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Giftware License.

> http://liballeg.org/license.html#allegro-4-the-giftware-license

---

##### `GL2_P_S` <a name="construct-hub.SpdxLicense.property.GL2_P_S"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GL2PS License.

> http://www.geuz.org/gl2ps/COPYING.GL2PS

---

##### `GLIDE` <a name="construct-hub.SpdxLicense.property.GLIDE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

3dfx Glide License.

> http://www.users.on.net/~triforce/glidexp/COPYING.txt

---

##### `GLULXE` <a name="construct-hub.SpdxLicense.property.GLULXE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Glulxe License.

> https://fedoraproject.org/wiki/Licensing/Glulxe

---

##### `GLWTPL` <a name="construct-hub.SpdxLicense.property.GLWTPL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Good Luck With That Public License.

> https://github.com/me-shaon/GLWTPL/commit/da5f6bc734095efbacb442c0b31e33a65b9d6e85

---

##### `GNUPLOT` <a name="construct-hub.SpdxLicense.property.GNUPLOT"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

gnuplot License.

> https://fedoraproject.org/wiki/Licensing/Gnuplot

---

##### `GPL_1_0` <a name="construct-hub.SpdxLicense.property.GPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v1.0 only.

> https://www.gnu.org/licenses/old-licenses/gpl-1.0-standalone.html

---

##### `GPL_1_0_ONLY` <a name="construct-hub.SpdxLicense.property.GPL_1_0_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v1.0 only.

> https://www.gnu.org/licenses/old-licenses/gpl-1.0-standalone.html

---

##### `GPL_1_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.GPL_1_0_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v1.0 or later.

> https://www.gnu.org/licenses/old-licenses/gpl-1.0-standalone.html

---

##### `GPL_1_0_PLUS` <a name="construct-hub.SpdxLicense.property.GPL_1_0_PLUS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v1.0 or later.

> https://www.gnu.org/licenses/old-licenses/gpl-1.0-standalone.html

---

##### `GPL_2_0` <a name="construct-hub.SpdxLicense.property.GPL_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 only.

> https://www.gnu.org/licenses/old-licenses/gpl-2.0-standalone.html

---

##### `GPL_2_0_ONLY` <a name="construct-hub.SpdxLicense.property.GPL_2_0_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 only.

> https://www.gnu.org/licenses/old-licenses/gpl-2.0-standalone.html

---

##### `GPL_2_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.GPL_2_0_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 or later.

> https://www.gnu.org/licenses/old-licenses/gpl-2.0-standalone.html

---

##### `GPL_2_0_PLUS` <a name="construct-hub.SpdxLicense.property.GPL_2_0_PLUS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 or later.

> https://www.gnu.org/licenses/old-licenses/gpl-2.0-standalone.html

---

##### `GPL_2_0_WITH_AUTOCONF_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_2_0_WITH_AUTOCONF_EXCEPTION"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 w/Autoconf exception.

> http://ac-archive.sourceforge.net/doc/copyright.html

---

##### `GPL_2_0_WITH_BISON_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_2_0_WITH_BISON_EXCEPTION"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 w/Bison exception.

> http://git.savannah.gnu.org/cgit/bison.git/tree/data/yacc.c?id=193d7c7054ba7197b0789e14965b739162319b5e#n141

---

##### `GPL_2_0_WITH_CLASSPATH_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_2_0_WITH_CLASSPATH_EXCEPTION"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 w/Classpath exception.

> https://www.gnu.org/software/classpath/license.html

---

##### `GPL_2_0_WITH_FONT_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_2_0_WITH_FONT_EXCEPTION"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 w/Font exception.

> https://www.gnu.org/licenses/gpl-faq.html#FontException

---

##### `GPL_2_0_WITH_GCC_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_2_0_WITH_GCC_EXCEPTION"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 w/GCC Runtime Library exception.

> https://gcc.gnu.org/git/?p=gcc.git;a=blob;f=gcc/libgcc1.c;h=762f5143fc6eed57b6797c82710f3538aa52b40b;hb=cb143a3ce4fb417c68f5fa2691a1b1b1053dfba9#l10

---

##### `GPL_3_0` <a name="construct-hub.SpdxLicense.property.GPL_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v3.0 only.

> https://www.gnu.org/licenses/gpl-3.0-standalone.html

---

##### `GPL_3_0_ONLY` <a name="construct-hub.SpdxLicense.property.GPL_3_0_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v3.0 only.

> https://www.gnu.org/licenses/gpl-3.0-standalone.html

---

##### `GPL_3_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.GPL_3_0_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v3.0 or later.

> https://www.gnu.org/licenses/gpl-3.0-standalone.html

---

##### `GPL_3_0_PLUS` <a name="construct-hub.SpdxLicense.property.GPL_3_0_PLUS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v3.0 or later.

> https://www.gnu.org/licenses/gpl-3.0-standalone.html

---

##### `GPL_3_0_WITH_AUTOCONF_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_3_0_WITH_AUTOCONF_EXCEPTION"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v3.0 w/Autoconf exception.

> https://www.gnu.org/licenses/autoconf-exception-3.0.html

---

##### `GPL_3_0_WITH_GCC_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_3_0_WITH_GCC_EXCEPTION"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v3.0 w/GCC Runtime Library exception.

> https://www.gnu.org/licenses/gcc-exception-3.1.html

---

##### `GSOAP_1_3B` <a name="construct-hub.SpdxLicense.property.GSOAP_1_3B"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

gSOAP Public License v1.3b.

> http://www.cs.fsu.edu/~engelen/license.html

---

##### `HASKELL_REPORT` <a name="construct-hub.SpdxLicense.property.HASKELL_REPORT"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Haskell Language Report License.

> https://fedoraproject.org/wiki/Licensing/Haskell_Language_Report_License

---

##### `HIPPOCRATIC_2_1` <a name="construct-hub.SpdxLicense.property.HIPPOCRATIC_2_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Hippocratic License 2.1.

> https://firstdonoharm.dev/version/2/1/license.html

---

##### `HPND` <a name="construct-hub.SpdxLicense.property.HPND"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Historical Permission Notice and Disclaimer.

> https://opensource.org/licenses/HPND

---

##### `HPND_SELL_VARIANT` <a name="construct-hub.SpdxLicense.property.HPND_SELL_VARIANT"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Historical Permission Notice and Disclaimer - sell variant.

> https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/net/sunrpc/auth_gss/gss_generic_token.c?h=v4.19

---

##### `HTMLTIDY` <a name="construct-hub.SpdxLicense.property.HTMLTIDY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

HTML Tidy License.

> https://github.com/htacg/tidy-html5/blob/next/README/LICENSE.md

---

##### `I_MATIX` <a name="construct-hub.SpdxLicense.property.I_MATIX"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

iMatix Standard Function Library Agreement.

> http://legacy.imatix.com/html/sfl/sfl4.htm#license

---

##### `IBM_PIBS` <a name="construct-hub.SpdxLicense.property.IBM_PIBS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

IBM PowerPC Initialization and Boot Software.

> http://git.denx.de/?p=u-boot.git;a=blob;f=arch/powerpc/cpu/ppc4xx/miiphy.c;h=297155fdafa064b955e53e9832de93bfb0cfb85b;hb=9fab4bf4cc077c21e43941866f3f2c196f28670d

---

##### `ICU` <a name="construct-hub.SpdxLicense.property.ICU"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ICU License.

> http://source.icu-project.org/repos/icu/icu/trunk/license.html

---

##### `IJG` <a name="construct-hub.SpdxLicense.property.IJG"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Independent JPEG Group License.

> http://dev.w3.org/cvsweb/Amaya/libjpeg/Attic/README?rev=1.2

---

##### `IMAGE_MAGICK` <a name="construct-hub.SpdxLicense.property.IMAGE_MAGICK"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ImageMagick License.

> http://www.imagemagick.org/script/license.php

---

##### `IMLIB2` <a name="construct-hub.SpdxLicense.property.IMLIB2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Imlib2 License.

> http://trac.enlightenment.org/e/browser/trunk/imlib2/COPYING

---

##### `INFO_ZIP` <a name="construct-hub.SpdxLicense.property.INFO_ZIP"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Info-ZIP License.

> http://www.info-zip.org/license.html

---

##### `INTEL` <a name="construct-hub.SpdxLicense.property.INTEL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Intel Open Source License.

> https://opensource.org/licenses/Intel

---

##### `INTEL_ACPI` <a name="construct-hub.SpdxLicense.property.INTEL_ACPI"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Intel ACPI Software License Agreement.

> https://fedoraproject.org/wiki/Licensing/Intel_ACPI_Software_License_Agreement

---

##### `INTERBASE_1_0` <a name="construct-hub.SpdxLicense.property.INTERBASE_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Interbase Public License v1.0.

> https://web.archive.org/web/20060319014854/http://info.borland.com/devsupport/interbase/opensource/IPL.html

---

##### `IPA` <a name="construct-hub.SpdxLicense.property.IPA"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

IPA Font License.

> https://opensource.org/licenses/IPA

---

##### `IPL_1_0` <a name="construct-hub.SpdxLicense.property.IPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

IBM Public License v1.0.

> https://opensource.org/licenses/IPL-1.0

---

##### `ISC` <a name="construct-hub.SpdxLicense.property.ISC"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ISC License.

> https://www.isc.org/downloads/software-support-policy/isc-license/

---

##### `JASPER_2_0` <a name="construct-hub.SpdxLicense.property.JASPER_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

JasPer License.

> http://www.ece.uvic.ca/~mdadams/jasper/LICENSE

---

##### `JPNIC` <a name="construct-hub.SpdxLicense.property.JPNIC"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Japan Network Information Center License.

> https://gitlab.isc.org/isc-projects/bind9/blob/master/COPYRIGHT#L366

---

##### `JSON` <a name="construct-hub.SpdxLicense.property.JSON"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

JSON License.

> http://www.json.org/license.html

---

##### `LAL_1_2` <a name="construct-hub.SpdxLicense.property.LAL_1_2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Licence Art Libre 1.2.

> http://artlibre.org/licence/lal/licence-art-libre-12/

---

##### `LAL_1_3` <a name="construct-hub.SpdxLicense.property.LAL_1_3"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Licence Art Libre 1.3.

> https://artlibre.org/

---

##### `LATEX2_E` <a name="construct-hub.SpdxLicense.property.LATEX2_E"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Latex2e License.

> https://fedoraproject.org/wiki/Licensing/Latex2e

---

##### `LEPTONICA` <a name="construct-hub.SpdxLicense.property.LEPTONICA"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Leptonica License.

> https://fedoraproject.org/wiki/Licensing/Leptonica

---

##### `LGPL_2_0` <a name="construct-hub.SpdxLicense.property.LGPL_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Library General Public License v2 only.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.0-standalone.html

---

##### `LGPL_2_0_ONLY` <a name="construct-hub.SpdxLicense.property.LGPL_2_0_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Library General Public License v2 only.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.0-standalone.html

---

##### `LGPL_2_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.LGPL_2_0_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Library General Public License v2 or later.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.0-standalone.html

---

##### `LGPL_2_0_PLUS` <a name="construct-hub.SpdxLicense.property.LGPL_2_0_PLUS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Library General Public License v2 or later.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.0-standalone.html

---

##### `LGPL_2_1` <a name="construct-hub.SpdxLicense.property.LGPL_2_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v2.1 only.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.1-standalone.html

---

##### `LGPL_2_1_ONLY` <a name="construct-hub.SpdxLicense.property.LGPL_2_1_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v2.1 only.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.1-standalone.html

---

##### `LGPL_2_1_OR_LATER` <a name="construct-hub.SpdxLicense.property.LGPL_2_1_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v2.1 or later.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.1-standalone.html

---

##### `LGPL_2_1_PLUS` <a name="construct-hub.SpdxLicense.property.LGPL_2_1_PLUS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Library General Public License v2.1 or later.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.1-standalone.html

---

##### `LGPL_3_0` <a name="construct-hub.SpdxLicense.property.LGPL_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v3.0 only.

> https://www.gnu.org/licenses/lgpl-3.0-standalone.html

---

##### `LGPL_3_0_ONLY` <a name="construct-hub.SpdxLicense.property.LGPL_3_0_ONLY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v3.0 only.

> https://www.gnu.org/licenses/lgpl-3.0-standalone.html

---

##### `LGPL_3_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.LGPL_3_0_OR_LATER"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v3.0 or later.

> https://www.gnu.org/licenses/lgpl-3.0-standalone.html

---

##### `LGPL_3_0_PLUS` <a name="construct-hub.SpdxLicense.property.LGPL_3_0_PLUS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v3.0 or later.

> https://www.gnu.org/licenses/lgpl-3.0-standalone.html

---

##### `LGPLLR` <a name="construct-hub.SpdxLicense.property.LGPLLR"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Lesser General Public License For Linguistic Resources.

> http://www-igm.univ-mlv.fr/~unitex/lgpllr.html

---

##### `LIBPNG` <a name="construct-hub.SpdxLicense.property.LIBPNG"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

libpng License.

> http://www.libpng.org/pub/png/src/libpng-LICENSE.txt

---

##### `LIBPNG_2_0` <a name="construct-hub.SpdxLicense.property.LIBPNG_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

PNG Reference Library version 2.

> http://www.libpng.org/pub/png/src/libpng-LICENSE.txt

---

##### `LIBSELINUX_1_0` <a name="construct-hub.SpdxLicense.property.LIBSELINUX_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

libselinux public domain notice.

> https://github.com/SELinuxProject/selinux/blob/master/libselinux/LICENSE

---

##### `LIBTIFF` <a name="construct-hub.SpdxLicense.property.LIBTIFF"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

libtiff License.

> https://fedoraproject.org/wiki/Licensing/libtiff

---

##### `LILIQ_P_1_1` <a name="construct-hub.SpdxLicense.property.LILIQ_P_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Licence Libre du Québec – Permissive version 1.1.

> https://forge.gouv.qc.ca/licence/fr/liliq-v1-1/

---

##### `LILIQ_R_1_1` <a name="construct-hub.SpdxLicense.property.LILIQ_R_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Licence Libre du Québec – Réciprocité version 1.1.

> https://www.forge.gouv.qc.ca/participez/licence-logicielle/licence-libre-du-quebec-liliq-en-francais/licence-libre-du-quebec-reciprocite-liliq-r-v1-1/

---

##### `LILIQ_RPLUS_1_1` <a name="construct-hub.SpdxLicense.property.LILIQ_RPLUS_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Licence Libre du Québec – Réciprocité forte version 1.1.

> https://www.forge.gouv.qc.ca/participez/licence-logicielle/licence-libre-du-quebec-liliq-en-francais/licence-libre-du-quebec-reciprocite-forte-liliq-r-v1-1/

---

##### `LINUX_OPENIB` <a name="construct-hub.SpdxLicense.property.LINUX_OPENIB"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Linux Kernel Variant of OpenIB.org license.

> https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/drivers/infiniband/core/sa.h

---

##### `LPL_1_0` <a name="construct-hub.SpdxLicense.property.LPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Lucent Public License Version 1.0.

> https://opensource.org/licenses/LPL-1.0

---

##### `LPL_1_02` <a name="construct-hub.SpdxLicense.property.LPL_1_02"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Lucent Public License v1.02.

> http://plan9.bell-labs.com/plan9/license.html

---

##### `LPPL_1_0` <a name="construct-hub.SpdxLicense.property.LPPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

LaTeX Project Public License v1.0.

> http://www.latex-project.org/lppl/lppl-1-0.txt

---

##### `LPPL_1_1` <a name="construct-hub.SpdxLicense.property.LPPL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

LaTeX Project Public License v1.1.

> http://www.latex-project.org/lppl/lppl-1-1.txt

---

##### `LPPL_1_2` <a name="construct-hub.SpdxLicense.property.LPPL_1_2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

LaTeX Project Public License v1.2.

> http://www.latex-project.org/lppl/lppl-1-2.txt

---

##### `LPPL_1_3A` <a name="construct-hub.SpdxLicense.property.LPPL_1_3A"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

LaTeX Project Public License v1.3a.

> http://www.latex-project.org/lppl/lppl-1-3a.txt

---

##### `LPPL_1_3C` <a name="construct-hub.SpdxLicense.property.LPPL_1_3C"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

LaTeX Project Public License v1.3c.

> http://www.latex-project.org/lppl/lppl-1-3c.txt

---

##### `MAKE_INDEX` <a name="construct-hub.SpdxLicense.property.MAKE_INDEX"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

MakeIndex License.

> https://fedoraproject.org/wiki/Licensing/MakeIndex

---

##### `MIR_O_S` <a name="construct-hub.SpdxLicense.property.MIR_O_S"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

The MirOS Licence.

> https://opensource.org/licenses/MirOS

---

##### `MIT` <a name="construct-hub.SpdxLicense.property.MIT"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

MIT License.

> https://opensource.org/licenses/MIT

---

##### `MIT_0` <a name="construct-hub.SpdxLicense.property.MIT_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

MIT No Attribution.

> https://github.com/aws/mit-0

---

##### `MIT_ADVERTISING` <a name="construct-hub.SpdxLicense.property.MIT_ADVERTISING"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Enlightenment License (e16).

> https://fedoraproject.org/wiki/Licensing/MIT_With_Advertising

---

##### `MIT_CMU` <a name="construct-hub.SpdxLicense.property.MIT_CMU"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CMU License.

> https://fedoraproject.org/wiki/Licensing:MIT?rd=Licensing/MIT#CMU_Style

---

##### `MIT_ENNA` <a name="construct-hub.SpdxLicense.property.MIT_ENNA"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

enna License.

> https://fedoraproject.org/wiki/Licensing/MIT#enna

---

##### `MIT_FEH` <a name="construct-hub.SpdxLicense.property.MIT_FEH"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

feh License.

> https://fedoraproject.org/wiki/Licensing/MIT#feh

---

##### `MIT_OPEN_GROUP` <a name="construct-hub.SpdxLicense.property.MIT_OPEN_GROUP"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

MIT Open Group variant.

> https://gitlab.freedesktop.org/xorg/app/iceauth/-/blob/master/COPYING

---

##### `MITNFA` <a name="construct-hub.SpdxLicense.property.MITNFA"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

MIT +no-false-attribs license.

> https://fedoraproject.org/wiki/Licensing/MITNFA

---

##### `MOTOSOTO` <a name="construct-hub.SpdxLicense.property.MOTOSOTO"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Motosoto License.

> https://opensource.org/licenses/Motosoto

---

##### `MPICH2` <a name="construct-hub.SpdxLicense.property.MPICH2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

mpich2 License.

> https://fedoraproject.org/wiki/Licensing/MIT

---

##### `MPL_1_0` <a name="construct-hub.SpdxLicense.property.MPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mozilla Public License 1.0.

> http://www.mozilla.org/MPL/MPL-1.0.html

---

##### `MPL_1_1` <a name="construct-hub.SpdxLicense.property.MPL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mozilla Public License 1.1.

> http://www.mozilla.org/MPL/MPL-1.1.html

---

##### `MPL_2_0` <a name="construct-hub.SpdxLicense.property.MPL_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mozilla Public License 2.0.

> http://www.mozilla.org/MPL/2.0/

---

##### `MPL_2_0_NO_COPYLEFT_EXCEPTION` <a name="construct-hub.SpdxLicense.property.MPL_2_0_NO_COPYLEFT_EXCEPTION"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mozilla Public License 2.0 (no copyleft exception).

> http://www.mozilla.org/MPL/2.0/

---

##### `MS_PL` <a name="construct-hub.SpdxLicense.property.MS_PL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Microsoft Public License.

> http://www.microsoft.com/opensource/licenses.mspx

---

##### `MS_RL` <a name="construct-hub.SpdxLicense.property.MS_RL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Microsoft Reciprocal License.

> http://www.microsoft.com/opensource/licenses.mspx

---

##### `MTLL` <a name="construct-hub.SpdxLicense.property.MTLL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Matrix Template Library License.

> https://fedoraproject.org/wiki/Licensing/Matrix_Template_Library_License

---

##### `MULANPSL_1_0` <a name="construct-hub.SpdxLicense.property.MULANPSL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mulan Permissive Software License, Version 1.

> https://license.coscl.org.cn/MulanPSL/

---

##### `MULANPSL_2_0` <a name="construct-hub.SpdxLicense.property.MULANPSL_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mulan Permissive Software License, Version 2.

> https://license.coscl.org.cn/MulanPSL2/

---

##### `MULTICS` <a name="construct-hub.SpdxLicense.property.MULTICS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Multics License.

> https://opensource.org/licenses/Multics

---

##### `MUP` <a name="construct-hub.SpdxLicense.property.MUP"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mup License.

> https://fedoraproject.org/wiki/Licensing/Mup

---

##### `NASA_1_3` <a name="construct-hub.SpdxLicense.property.NASA_1_3"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NASA Open Source Agreement 1.3.

> http://ti.arc.nasa.gov/opensource/nosa/

---

##### `NAUMEN` <a name="construct-hub.SpdxLicense.property.NAUMEN"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Naumen Public License.

> https://opensource.org/licenses/Naumen

---

##### `NBPL_1_0` <a name="construct-hub.SpdxLicense.property.NBPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Net Boolean Public License v1.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=37b4b3f6cc4bf34e1d3dec61e69914b9819d8894

---

##### `NCGL_UK_2_0` <a name="construct-hub.SpdxLicense.property.NCGL_UK_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Non-Commercial Government Licence.

> https://github.com/spdx/license-list-XML/blob/master/src/Apache-2.0.xml

---

##### `NCSA` <a name="construct-hub.SpdxLicense.property.NCSA"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

University of Illinois/NCSA Open Source License.

> http://otm.illinois.edu/uiuc_openSource

---

##### `NET_CD_F` <a name="construct-hub.SpdxLicense.property.NET_CD_F"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NetCDF license.

> http://www.unidata.ucar.edu/software/netcdf/copyright.html

---

##### `NET_SNMP` <a name="construct-hub.SpdxLicense.property.NET_SNMP"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Net-SNMP License.

> http://net-snmp.sourceforge.net/about/license.html

---

##### `NEWSLETR` <a name="construct-hub.SpdxLicense.property.NEWSLETR"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Newsletr License.

> https://fedoraproject.org/wiki/Licensing/Newsletr

---

##### `NGPL` <a name="construct-hub.SpdxLicense.property.NGPL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Nethack General Public License.

> https://opensource.org/licenses/NGPL

---

##### `NIST_PD` <a name="construct-hub.SpdxLicense.property.NIST_PD"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NIST Public Domain Notice.

> https://github.com/tcheneau/simpleRPL/blob/e645e69e38dd4e3ccfeceb2db8cba05b7c2e0cd3/LICENSE.txt

---

##### `NIST_PD_FALLBACK` <a name="construct-hub.SpdxLicense.property.NIST_PD_FALLBACK"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NIST Public Domain Notice with license fallback.

> https://github.com/usnistgov/jsip/blob/59700e6926cbe96c5cdae897d9a7d2656b42abe3/LICENSE

---

##### `NLOD_1_0` <a name="construct-hub.SpdxLicense.property.NLOD_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Norwegian Licence for Open Government Data.

> http://data.norge.no/nlod/en/1.0

---

##### `NLPL` <a name="construct-hub.SpdxLicense.property.NLPL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

No Limit Public License.

> https://fedoraproject.org/wiki/Licensing/NLPL

---

##### `NOKIA` <a name="construct-hub.SpdxLicense.property.NOKIA"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Nokia Open Source License.

> https://opensource.org/licenses/nokia

---

##### `NOSL` <a name="construct-hub.SpdxLicense.property.NOSL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Netizen Open Source License.

> http://bits.netizen.com.au/licenses/NOSL/nosl.txt

---

##### `NOWEB` <a name="construct-hub.SpdxLicense.property.NOWEB"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Noweb License.

> https://fedoraproject.org/wiki/Licensing/Noweb

---

##### `NPL_1_0` <a name="construct-hub.SpdxLicense.property.NPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Netscape Public License v1.0.

> http://www.mozilla.org/MPL/NPL/1.0/

---

##### `NPL_1_1` <a name="construct-hub.SpdxLicense.property.NPL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Netscape Public License v1.1.

> http://www.mozilla.org/MPL/NPL/1.1/

---

##### `NPOSL_3_0` <a name="construct-hub.SpdxLicense.property.NPOSL_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Non-Profit Open Software License 3.0.

> https://opensource.org/licenses/NOSL3.0

---

##### `NRL` <a name="construct-hub.SpdxLicense.property.NRL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NRL License.

> http://web.mit.edu/network/isakmp/nrllicense.html

---

##### `NTP` <a name="construct-hub.SpdxLicense.property.NTP"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NTP License.

> https://opensource.org/licenses/NTP

---

##### `NTP_0` <a name="construct-hub.SpdxLicense.property.NTP_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NTP No Attribution.

> https://github.com/tytso/e2fsprogs/blob/master/lib/et/et_name.c

---

##### `NUNIT` <a name="construct-hub.SpdxLicense.property.NUNIT"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Nunit License.

> https://fedoraproject.org/wiki/Licensing/Nunit

---

##### `O_UDA_1_0` <a name="construct-hub.SpdxLicense.property.O_UDA_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Use of Data Agreement v1.0.

> https://github.com/microsoft/Open-Use-of-Data-Agreement/blob/v1.0/O-UDA-1.0.md

---

##### `OCCT_PL` <a name="construct-hub.SpdxLicense.property.OCCT_PL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open CASCADE Technology Public License.

> http://www.opencascade.com/content/occt-public-license

---

##### `OCLC_2_0` <a name="construct-hub.SpdxLicense.property.OCLC_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

OCLC Research Public License 2.0.

> http://www.oclc.org/research/activities/software/license/v2final.htm

---

##### `ODBL_1_0` <a name="construct-hub.SpdxLicense.property.ODBL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ODC Open Database License v1.0.

> http://www.opendatacommons.org/licenses/odbl/1.0/

---

##### `ODC_BY_1_0` <a name="construct-hub.SpdxLicense.property.ODC_BY_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Data Commons Attribution License v1.0.

> https://opendatacommons.org/licenses/by/1.0/

---

##### `OFL_1_0` <a name="construct-hub.SpdxLicense.property.OFL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SIL Open Font License 1.0.

> http://scripts.sil.org/cms/scripts/page.php?item_id=OFL10_web

---

##### `OFL_1_0_NO_RFN` <a name="construct-hub.SpdxLicense.property.OFL_1_0_NO_RFN"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SIL Open Font License 1.0 with no Reserved Font Name.

> http://scripts.sil.org/cms/scripts/page.php?item_id=OFL10_web

---

##### `OFL_1_0_RFN` <a name="construct-hub.SpdxLicense.property.OFL_1_0_RFN"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SIL Open Font License 1.0 with Reserved Font Name.

> http://scripts.sil.org/cms/scripts/page.php?item_id=OFL10_web

---

##### `OFL_1_1` <a name="construct-hub.SpdxLicense.property.OFL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SIL Open Font License 1.1.

> http://scripts.sil.org/cms/scripts/page.php?item_id=OFL_web

---

##### `OFL_1_1_NO_RFN` <a name="construct-hub.SpdxLicense.property.OFL_1_1_NO_RFN"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SIL Open Font License 1.1 with no Reserved Font Name.

> http://scripts.sil.org/cms/scripts/page.php?item_id=OFL_web

---

##### `OFL_1_1_RFN` <a name="construct-hub.SpdxLicense.property.OFL_1_1_RFN"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SIL Open Font License 1.1 with Reserved Font Name.

> http://scripts.sil.org/cms/scripts/page.php?item_id=OFL_web

---

##### `OGC_1_0` <a name="construct-hub.SpdxLicense.property.OGC_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

OGC Software License, Version 1.0.

> https://www.ogc.org/ogc/software/1.0

---

##### `OGL_CANADA_2_0` <a name="construct-hub.SpdxLicense.property.OGL_CANADA_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Government Licence - Canada.

> https://open.canada.ca/en/open-government-licence-canada

---

##### `OGL_UK_1_0` <a name="construct-hub.SpdxLicense.property.OGL_UK_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Government Licence v1.0.

> http://www.nationalarchives.gov.uk/doc/open-government-licence/version/1/

---

##### `OGL_UK_2_0` <a name="construct-hub.SpdxLicense.property.OGL_UK_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Government Licence v2.0.

> http://www.nationalarchives.gov.uk/doc/open-government-licence/version/2/

---

##### `OGL_UK_3_0` <a name="construct-hub.SpdxLicense.property.OGL_UK_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Government Licence v3.0.

> http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

---

##### `OGTSL` <a name="construct-hub.SpdxLicense.property.OGTSL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Group Test Suite License.

> http://www.opengroup.org/testing/downloads/The_Open_Group_TSL.txt

---

##### `OLDAP_1_1` <a name="construct-hub.SpdxLicense.property.OLDAP_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v1.1.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=806557a5ad59804ef3a44d5abfbe91d706b0791f

---

##### `OLDAP_1_2` <a name="construct-hub.SpdxLicense.property.OLDAP_1_2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v1.2.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=42b0383c50c299977b5893ee695cf4e486fb0dc7

---

##### `OLDAP_1_3` <a name="construct-hub.SpdxLicense.property.OLDAP_1_3"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v1.3.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=e5f8117f0ce088d0bd7a8e18ddf37eaa40eb09b1

---

##### `OLDAP_1_4` <a name="construct-hub.SpdxLicense.property.OLDAP_1_4"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v1.4.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=c9f95c2f3f2ffb5e0ae55fe7388af75547660941

---

##### `OLDAP_2_0` <a name="construct-hub.SpdxLicense.property.OLDAP_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.0 (or possibly 2.0A and 2.0B).

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=cbf50f4e1185a21abd4c0a54d3f4341fe28f36ea

---

##### `OLDAP_2_0_1` <a name="construct-hub.SpdxLicense.property.OLDAP_2_0_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.0.1.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=b6d68acd14e51ca3aab4428bf26522aa74873f0e

---

##### `OLDAP_2_1` <a name="construct-hub.SpdxLicense.property.OLDAP_2_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.1.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=b0d176738e96a0d3b9f85cb51e140a86f21be715

---

##### `OLDAP_2_2` <a name="construct-hub.SpdxLicense.property.OLDAP_2_2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.2.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=470b0c18ec67621c85881b2733057fecf4a1acc3

---

##### `OLDAP_2_2_1` <a name="construct-hub.SpdxLicense.property.OLDAP_2_2_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.2.1.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=4bc786f34b50aa301be6f5600f58a980070f481e

---

##### `OLDAP_2_2_2` <a name="construct-hub.SpdxLicense.property.OLDAP_2_2_2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License 2.2.2.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=df2cc1e21eb7c160695f5b7cffd6296c151ba188

---

##### `OLDAP_2_3` <a name="construct-hub.SpdxLicense.property.OLDAP_2_3"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.3.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=d32cf54a32d581ab475d23c810b0a7fbaf8d63c3

---

##### `OLDAP_2_4` <a name="construct-hub.SpdxLicense.property.OLDAP_2_4"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.4.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=cd1284c4a91a8a380d904eee68d1583f989ed386

---

##### `OLDAP_2_5` <a name="construct-hub.SpdxLicense.property.OLDAP_2_5"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.5.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=6852b9d90022e8593c98205413380536b1b5a7cf

---

##### `OLDAP_2_6` <a name="construct-hub.SpdxLicense.property.OLDAP_2_6"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.6.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=1cae062821881f41b73012ba816434897abf4205

---

##### `OLDAP_2_7` <a name="construct-hub.SpdxLicense.property.OLDAP_2_7"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.7.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=47c2415c1df81556eeb39be6cad458ef87c534a2

---

##### `OLDAP_2_8` <a name="construct-hub.SpdxLicense.property.OLDAP_2_8"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.8.

> http://www.openldap.org/software/release/license.html

---

##### `OML` <a name="construct-hub.SpdxLicense.property.OML"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Market License.

> https://fedoraproject.org/wiki/Licensing/Open_Market_License

---

##### `OPEN_SS_L` <a name="construct-hub.SpdxLicense.property.OPEN_SS_L"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

OpenSSL License.

> http://www.openssl.org/source/license.html

---

##### `OPL_1_0` <a name="construct-hub.SpdxLicense.property.OPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Public License v1.0.

> http://old.koalateam.com/jackaroo/OPL_1_0.TXT

---

##### `OSET_PL_2_1` <a name="construct-hub.SpdxLicense.property.OSET_PL_2_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

OSET Public License version 2.1.

> http://www.osetfoundation.org/public-license

---

##### `OSL_1_0` <a name="construct-hub.SpdxLicense.property.OSL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Software License 1.0.

> https://opensource.org/licenses/OSL-1.0

---

##### `OSL_1_1` <a name="construct-hub.SpdxLicense.property.OSL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Software License 1.1.

> https://fedoraproject.org/wiki/Licensing/OSL1.1

---

##### `OSL_2_0` <a name="construct-hub.SpdxLicense.property.OSL_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Software License 2.0.

> http://web.archive.org/web/20041020171434/http://www.rosenlaw.com/osl2.0.html

---

##### `OSL_2_1` <a name="construct-hub.SpdxLicense.property.OSL_2_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Software License 2.1.

> http://web.archive.org/web/20050212003940/http://www.rosenlaw.com/osl21.htm

---

##### `OSL_3_0` <a name="construct-hub.SpdxLicense.property.OSL_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Software License 3.0.

> https://web.archive.org/web/20120101081418/http://rosenlaw.com:80/OSL3.0.htm

---

##### `PARITY_6_0_0` <a name="construct-hub.SpdxLicense.property.PARITY_6_0_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

The Parity Public License 6.0.0.

> https://paritylicense.com/versions/6.0.0.html

---

##### `PARITY_7_0_0` <a name="construct-hub.SpdxLicense.property.PARITY_7_0_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

The Parity Public License 7.0.0.

> https://paritylicense.com/versions/7.0.0.html

---

##### `PDDL_1_0` <a name="construct-hub.SpdxLicense.property.PDDL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ODC Public Domain Dedication & License 1.0.

> http://opendatacommons.org/licenses/pddl/1.0/

---

##### `PHP_3_0` <a name="construct-hub.SpdxLicense.property.PHP_3_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

PHP License v3.0.

> http://www.php.net/license/3_0.txt

---

##### `PHP_3_01` <a name="construct-hub.SpdxLicense.property.PHP_3_01"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

PHP License v3.01.

> http://www.php.net/license/3_01.txt

---

##### `PLEXUS` <a name="construct-hub.SpdxLicense.property.PLEXUS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Plexus Classworlds License.

> https://fedoraproject.org/wiki/Licensing/Plexus_Classworlds_License

---

##### `POLYFORM_NONCOMMERCIAL_1_0_0` <a name="construct-hub.SpdxLicense.property.POLYFORM_NONCOMMERCIAL_1_0_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

PolyForm Noncommercial License 1.0.0.

> https://polyformproject.org/licenses/noncommercial/1.0.0

---

##### `POLYFORM_SMALL_BUSINESS_1_0_0` <a name="construct-hub.SpdxLicense.property.POLYFORM_SMALL_BUSINESS_1_0_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

PolyForm Small Business License 1.0.0.

> https://polyformproject.org/licenses/small-business/1.0.0

---

##### `POSTGRE_SQ_L` <a name="construct-hub.SpdxLicense.property.POSTGRE_SQ_L"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

PostgreSQL License.

> http://www.postgresql.org/about/licence

---

##### `PSF_2_0` <a name="construct-hub.SpdxLicense.property.PSF_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Python Software Foundation License 2.0.

> https://opensource.org/licenses/Python-2.0

---

##### `PSFRAG` <a name="construct-hub.SpdxLicense.property.PSFRAG"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

psfrag License.

> https://fedoraproject.org/wiki/Licensing/psfrag

---

##### `PSUTILS` <a name="construct-hub.SpdxLicense.property.PSUTILS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

psutils License.

> https://fedoraproject.org/wiki/Licensing/psutils

---

##### `PYTHON_2_0` <a name="construct-hub.SpdxLicense.property.PYTHON_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Python License 2.0.

> https://opensource.org/licenses/Python-2.0

---

##### `QHULL` <a name="construct-hub.SpdxLicense.property.QHULL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Qhull License.

> https://fedoraproject.org/wiki/Licensing/Qhull

---

##### `QPL_1_0` <a name="construct-hub.SpdxLicense.property.QPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Q Public License 1.0.

> http://doc.qt.nokia.com/3.3/license.html

---

##### `RDISC` <a name="construct-hub.SpdxLicense.property.RDISC"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Rdisc License.

> https://fedoraproject.org/wiki/Licensing/Rdisc_License

---

##### `RHECOS_1_1` <a name="construct-hub.SpdxLicense.property.RHECOS_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Red Hat eCos Public License v1.1.

> http://ecos.sourceware.org/old-license.html

---

##### `RPL_1_1` <a name="construct-hub.SpdxLicense.property.RPL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Reciprocal Public License 1.1.

> https://opensource.org/licenses/RPL-1.1

---

##### `RPL_1_5` <a name="construct-hub.SpdxLicense.property.RPL_1_5"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Reciprocal Public License 1.5.

> https://opensource.org/licenses/RPL-1.5

---

##### `RPSL_1_0` <a name="construct-hub.SpdxLicense.property.RPSL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

RealNetworks Public Source License v1.0.

> https://helixcommunity.org/content/rpsl

---

##### `RSA_MD` <a name="construct-hub.SpdxLicense.property.RSA_MD"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

RSA Message-Digest License.

> http://www.faqs.org/rfcs/rfc1321.html

---

##### `RSCPL` <a name="construct-hub.SpdxLicense.property.RSCPL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Ricoh Source Code Public License.

> http://wayback.archive.org/web/20060715140826/http://www.risource.org/RPL/RPL-1.0A.shtml

---

##### `RUBY` <a name="construct-hub.SpdxLicense.property.RUBY"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Ruby License.

> http://www.ruby-lang.org/en/LICENSE.txt

---

##### `SAX_PD` <a name="construct-hub.SpdxLicense.property.SAX_PD"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sax Public Domain Notice.

> http://www.saxproject.org/copying.html

---

##### `SAXPATH` <a name="construct-hub.SpdxLicense.property.SAXPATH"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Saxpath License.

> https://fedoraproject.org/wiki/Licensing/Saxpath_License

---

##### `SCEA` <a name="construct-hub.SpdxLicense.property.SCEA"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SCEA Shared Source License.

> http://research.scea.com/scea_shared_source_license.html

---

##### `SENDMAIL` <a name="construct-hub.SpdxLicense.property.SENDMAIL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sendmail License.

> http://www.sendmail.com/pdfs/open_source/sendmail_license.pdf

---

##### `SENDMAIL_8_23` <a name="construct-hub.SpdxLicense.property.SENDMAIL_8_23"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sendmail License 8.23.

> https://www.proofpoint.com/sites/default/files/sendmail-license.pdf

---

##### `SGI_B_1_0` <a name="construct-hub.SpdxLicense.property.SGI_B_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SGI Free Software License B v1.0.

> http://oss.sgi.com/projects/FreeB/SGIFreeSWLicB.1.0.html

---

##### `SGI_B_1_1` <a name="construct-hub.SpdxLicense.property.SGI_B_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SGI Free Software License B v1.1.

> http://oss.sgi.com/projects/FreeB/

---

##### `SGI_B_2_0` <a name="construct-hub.SpdxLicense.property.SGI_B_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SGI Free Software License B v2.0.

> http://oss.sgi.com/projects/FreeB/SGIFreeSWLicB.2.0.pdf

---

##### `SHL_0_5` <a name="construct-hub.SpdxLicense.property.SHL_0_5"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Solderpad Hardware License v0.5.

> https://solderpad.org/licenses/SHL-0.5/

---

##### `SHL_0_51` <a name="construct-hub.SpdxLicense.property.SHL_0_51"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Solderpad Hardware License, Version 0.51.

> https://solderpad.org/licenses/SHL-0.51/

---

##### `SIMPL_2_0` <a name="construct-hub.SpdxLicense.property.SIMPL_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Simple Public License 2.0.

> https://opensource.org/licenses/SimPL-2.0

---

##### `SISSL` <a name="construct-hub.SpdxLicense.property.SISSL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sun Industry Standards Source License v1.1.

> http://www.openoffice.org/licenses/sissl_license.html

---

##### `SISSL_1_2` <a name="construct-hub.SpdxLicense.property.SISSL_1_2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sun Industry Standards Source License v1.2.

> http://gridscheduler.sourceforge.net/Gridengine_SISSL_license.html

---

##### `SLEEPYCAT` <a name="construct-hub.SpdxLicense.property.SLEEPYCAT"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sleepycat License.

> https://opensource.org/licenses/Sleepycat

---

##### `SMLNJ` <a name="construct-hub.SpdxLicense.property.SMLNJ"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Standard ML of New Jersey License.

> https://www.smlnj.org/license.html

---

##### `SMPPL` <a name="construct-hub.SpdxLicense.property.SMPPL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Secure Messaging Protocol Public License.

> https://github.com/dcblake/SMP/blob/master/Documentation/License.txt

---

##### `SNIA` <a name="construct-hub.SpdxLicense.property.SNIA"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SNIA Public License 1.1.

> https://fedoraproject.org/wiki/Licensing/SNIA_Public_License

---

##### `SPENCER_86` <a name="construct-hub.SpdxLicense.property.SPENCER_86"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Spencer License 86.

> https://fedoraproject.org/wiki/Licensing/Henry_Spencer_Reg-Ex_Library_License

---

##### `SPENCER_94` <a name="construct-hub.SpdxLicense.property.SPENCER_94"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Spencer License 94.

> https://fedoraproject.org/wiki/Licensing/Henry_Spencer_Reg-Ex_Library_License

---

##### `SPENCER_99` <a name="construct-hub.SpdxLicense.property.SPENCER_99"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Spencer License 99.

> http://www.opensource.apple.com/source/tcl/tcl-5/tcl/generic/regfronts.c

---

##### `SPL_1_0` <a name="construct-hub.SpdxLicense.property.SPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sun Public License v1.0.

> https://opensource.org/licenses/SPL-1.0

---

##### `SSH_OPENSSH` <a name="construct-hub.SpdxLicense.property.SSH_OPENSSH"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SSH OpenSSH license.

> https://github.com/openssh/openssh-portable/blob/1b11ea7c58cd5c59838b5fa574cd456d6047b2d4/LICENCE#L10

---

##### `SSH_SHORT` <a name="construct-hub.SpdxLicense.property.SSH_SHORT"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SSH short notice.

> https://github.com/openssh/openssh-portable/blob/1b11ea7c58cd5c59838b5fa574cd456d6047b2d4/pathnames.h

---

##### `SSPL_1_0` <a name="construct-hub.SpdxLicense.property.SSPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Server Side Public License, v 1.

> https://www.mongodb.com/licensing/server-side-public-license

---

##### `STANDARDML_NJ` <a name="construct-hub.SpdxLicense.property.STANDARDML_NJ"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Standard ML of New Jersey License.

> http://www.smlnj.org//license.html

---

##### `SUGARCRM_1_1_3` <a name="construct-hub.SpdxLicense.property.SUGARCRM_1_1_3"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SugarCRM Public License v1.1.3.

> http://www.sugarcrm.com/crm/SPL

---

##### `SWL` <a name="construct-hub.SpdxLicense.property.SWL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Scheme Widget Library (SWL) Software License Agreement.

> https://fedoraproject.org/wiki/Licensing/SWL

---

##### `TAPR_OHL_1_0` <a name="construct-hub.SpdxLicense.property.TAPR_OHL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

TAPR Open Hardware License v1.0.

> https://www.tapr.org/OHL

---

##### `TCL` <a name="construct-hub.SpdxLicense.property.TCL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

TCL/TK License.

> http://www.tcl.tk/software/tcltk/license.html

---

##### `TCP_WRAPPERS` <a name="construct-hub.SpdxLicense.property.TCP_WRAPPERS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

TCP Wrappers License.

> http://rc.quest.com/topics/openssh/license.php#tcpwrappers

---

##### `TMATE` <a name="construct-hub.SpdxLicense.property.TMATE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

TMate Open Source License.

> http://svnkit.com/license.html

---

##### `TORQUE_1_1` <a name="construct-hub.SpdxLicense.property.TORQUE_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

TORQUE v2.5+ Software License v1.1.

> https://fedoraproject.org/wiki/Licensing/TORQUEv1.1

---

##### `TOSL` <a name="construct-hub.SpdxLicense.property.TOSL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Trusster Open Source License.

> https://fedoraproject.org/wiki/Licensing/TOSL

---

##### `TU_BERLIN_1_0` <a name="construct-hub.SpdxLicense.property.TU_BERLIN_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Technische Universitaet Berlin License 1.0.

> https://github.com/swh/ladspa/blob/7bf6f3799fdba70fda297c2d8fd9f526803d9680/gsm/COPYRIGHT

---

##### `TU_BERLIN_2_0` <a name="construct-hub.SpdxLicense.property.TU_BERLIN_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Technische Universitaet Berlin License 2.0.

> https://github.com/CorsixTH/deps/blob/fd339a9f526d1d9c9f01ccf39e438a015da50035/licences/libgsm.txt

---

##### `UCL_1_0` <a name="construct-hub.SpdxLicense.property.UCL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Upstream Compatibility License v1.0.

> https://opensource.org/licenses/UCL-1.0

---

##### `UNICODE_DFS_2015` <a name="construct-hub.SpdxLicense.property.UNICODE_DFS_2015"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Unicode License Agreement - Data Files and Software (2015).

> https://web.archive.org/web/20151224134844/http://unicode.org/copyright.html

---

##### `UNICODE_DFS_2016` <a name="construct-hub.SpdxLicense.property.UNICODE_DFS_2016"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Unicode License Agreement - Data Files and Software (2016).

> http://www.unicode.org/copyright.html

---

##### `UNICODE_TOU` <a name="construct-hub.SpdxLicense.property.UNICODE_TOU"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Unicode Terms of Use.

> http://www.unicode.org/copyright.html

---

##### `UNLICENSE` <a name="construct-hub.SpdxLicense.property.UNLICENSE"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

The Unlicense.

> https://unlicense.org/

---

##### `UNLICENSED` <a name="construct-hub.SpdxLicense.property.UNLICENSED"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Packages that have not been licensed.

---

##### `UPL_1_0` <a name="construct-hub.SpdxLicense.property.UPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Universal Permissive License v1.0.

> https://opensource.org/licenses/UPL

---

##### `VIM` <a name="construct-hub.SpdxLicense.property.VIM"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Vim License.

> http://vimdoc.sourceforge.net/htmldoc/uganda.html

---

##### `VOSTROM` <a name="construct-hub.SpdxLicense.property.VOSTROM"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

VOSTROM Public License for Open Source.

> https://fedoraproject.org/wiki/Licensing/VOSTROM

---

##### `VSL_1_0` <a name="construct-hub.SpdxLicense.property.VSL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Vovida Software License v1.0.

> https://opensource.org/licenses/VSL-1.0

---

##### `W3_C` <a name="construct-hub.SpdxLicense.property.W3_C"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

W3C Software Notice and License (2002-12-31).

> http://www.w3.org/Consortium/Legal/2002/copyright-software-20021231.html

---

##### `W3C_19980720` <a name="construct-hub.SpdxLicense.property.W3C_19980720"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

W3C Software Notice and License (1998-07-20).

> http://www.w3.org/Consortium/Legal/copyright-software-19980720.html

---

##### `W3C_20150513` <a name="construct-hub.SpdxLicense.property.W3C_20150513"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

W3C Software Notice and Document License (2015-05-13).

> https://www.w3.org/Consortium/Legal/2015/copyright-software-and-document

---

##### `WATCOM_1_0` <a name="construct-hub.SpdxLicense.property.WATCOM_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sybase Open Watcom Public License 1.0.

> https://opensource.org/licenses/Watcom-1.0

---

##### `WSUIPA` <a name="construct-hub.SpdxLicense.property.WSUIPA"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Wsuipa License.

> https://fedoraproject.org/wiki/Licensing/Wsuipa

---

##### `WTFPL` <a name="construct-hub.SpdxLicense.property.WTFPL"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Do What The F*ck You Want To Public License.

> http://www.wtfpl.net/about/

---

##### `WX_WINDOWS` <a name="construct-hub.SpdxLicense.property.WX_WINDOWS"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

wxWindows Library License.

> https://opensource.org/licenses/WXwindows

---

##### `X11` <a name="construct-hub.SpdxLicense.property.X11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

X11 License.

> http://www.xfree86.org/3.3.6/COPYRIGHT2.html#3

---

##### `XEROX` <a name="construct-hub.SpdxLicense.property.XEROX"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Xerox License.

> https://fedoraproject.org/wiki/Licensing/Xerox

---

##### `XFREE86_1_1` <a name="construct-hub.SpdxLicense.property.XFREE86_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

XFree86 License 1.1.

> http://www.xfree86.org/current/LICENSE4.html

---

##### `XINETD` <a name="construct-hub.SpdxLicense.property.XINETD"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

xinetd License.

> https://fedoraproject.org/wiki/Licensing/Xinetd_License

---

##### `XNET` <a name="construct-hub.SpdxLicense.property.XNET"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

X.Net License.

> https://opensource.org/licenses/Xnet

---

##### `XPP` <a name="construct-hub.SpdxLicense.property.XPP"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

XPP License.

> https://fedoraproject.org/wiki/Licensing/xpp

---

##### `XSKAT` <a name="construct-hub.SpdxLicense.property.XSKAT"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

XSkat License.

> https://fedoraproject.org/wiki/Licensing/XSkat_License

---

##### `YPL_1_0` <a name="construct-hub.SpdxLicense.property.YPL_1_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Yahoo!

Public License v1.0

> http://www.zimbra.com/license/yahoo_public_license_1.0.html

---

##### `YPL_1_1` <a name="construct-hub.SpdxLicense.property.YPL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Yahoo!

Public License v1.1

> http://www.zimbra.com/license/yahoo_public_license_1.1.html

---

##### `ZED` <a name="construct-hub.SpdxLicense.property.ZED"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zed License.

> https://fedoraproject.org/wiki/Licensing/Zed

---

##### `ZEND_2_0` <a name="construct-hub.SpdxLicense.property.ZEND_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zend License v2.0.

> https://web.archive.org/web/20130517195954/http://www.zend.com/license/2_00.txt

---

##### `ZERO_BSD` <a name="construct-hub.SpdxLicense.property.ZERO_BSD"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD Zero Clause License.

> http://landley.net/toybox/license.html

---

##### `ZIMBRA_1_3` <a name="construct-hub.SpdxLicense.property.ZIMBRA_1_3"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zimbra Public License v1.3.

> http://web.archive.org/web/20100302225219/http://www.zimbra.com/license/zimbra-public-license-1-3.html

---

##### `ZIMBRA_1_4` <a name="construct-hub.SpdxLicense.property.ZIMBRA_1_4"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zimbra Public License v1.4.

> http://www.zimbra.com/legal/zimbra-public-license-1-4

---

##### `ZLIB` <a name="construct-hub.SpdxLicense.property.ZLIB"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

zlib License.

> http://www.zlib.net/zlib_license.html

---

##### `ZLIB_ACKNOWLEDGEMENT` <a name="construct-hub.SpdxLicense.property.ZLIB_ACKNOWLEDGEMENT"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

zlib/libpng License with Acknowledgement.

> https://fedoraproject.org/wiki/Licensing/ZlibWithAcknowledgement

---

##### `ZPL_1_1` <a name="construct-hub.SpdxLicense.property.ZPL_1_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zope Public License 1.1.

> http://old.zope.org/Resources/License/ZPL-1.1

---

##### `ZPL_2_0` <a name="construct-hub.SpdxLicense.property.ZPL_2_0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zope Public License 2.0.

> http://old.zope.org/Resources/License/ZPL-2.0

---

##### `ZPL_2_1` <a name="construct-hub.SpdxLicense.property.ZPL_2_1"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zope Public License 2.1.

> http://old.zope.org/Resources/ZPL/

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


### ILicenseList <a name="construct-hub.ILicenseList"></a>

- *Implemented By:* [`construct-hub.ILicenseList`](#construct-hub.ILicenseList)

#### Methods <a name="Methods"></a>

##### `grantRead` <a name="construct-hub.ILicenseList.grantRead"></a>

```typescript
public grantRead(handler: Function)
```

###### `handler`<sup>Required</sup> <a name="construct-hub.ILicenseList.parameter.handler"></a>

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


