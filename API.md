# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="constructs"></a>

### ConstructHub <a name="construct-hub.ConstructHub" id="constructhubconstructhub"></a>

- *Implements:* [`@aws-cdk/aws-iam.IGrantable`](#@aws-cdk/aws-iam.IGrantable)

Construct Hub.

#### Initializers <a name="construct-hub.ConstructHub.Initializer" id="constructhubconstructhubinitializer"></a>

```typescript
import { ConstructHub } from 'construct-hub'

new ConstructHub(scope: Construct, id: string, props?: ConstructHubProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`scope`](#constructhubconstructhubparameterscope)<span title="Required">*</span> | [`constructs.Construct`](#constructs.Construct) | *No description.* |
| [`id`](#constructhubconstructhubparameterid)<span title="Required">*</span> | `string` | *No description.* |
| [`props`](#constructhubconstructhubparameterprops) | [`construct-hub.ConstructHubProps`](#construct-hub.ConstructHubProps) | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="construct-hub.ConstructHub.parameter.scope" id="constructhubconstructhubparameterscope"></a>

- *Type:* [`constructs.Construct`](#constructs.Construct)

---

##### `id`<sup>Required</sup> <a name="construct-hub.ConstructHub.parameter.id" id="constructhubconstructhubparameterid"></a>

- *Type:* `string`

---

##### `props`<sup>Optional</sup> <a name="construct-hub.ConstructHub.parameter.props" id="constructhubconstructhubparameterprops"></a>

- *Type:* [`construct-hub.ConstructHubProps`](#construct-hub.ConstructHubProps)

---



#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`grantPrincipal`](#constructhubconstructhubpropertygrantprincipal)<span title="Required">*</span> | [`@aws-cdk/aws-iam.IPrincipal`](#@aws-cdk/aws-iam.IPrincipal) | The principal to grant permissions to. |
| [`ingestionQueue`](#constructhubconstructhubpropertyingestionqueue)<span title="Required">*</span> | [`@aws-cdk/aws-sqs.IQueue`](#@aws-cdk/aws-sqs.IQueue) | *No description.* |

---

##### `grantPrincipal`<sup>Required</sup> <a name="construct-hub.ConstructHub.property.grantPrincipal" id="constructhubconstructhubpropertygrantprincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* [`@aws-cdk/aws-iam.IPrincipal`](#@aws-cdk/aws-iam.IPrincipal)

The principal to grant permissions to.

---

##### `ingestionQueue`<sup>Required</sup> <a name="construct-hub.ConstructHub.property.ingestionQueue" id="constructhubconstructhubpropertyingestionqueue"></a>

```typescript
public readonly ingestionQueue: IQueue;
```

- *Type:* [`@aws-cdk/aws-sqs.IQueue`](#@aws-cdk/aws-sqs.IQueue)

---


### S3StorageFactory <a name="construct-hub.S3StorageFactory" id="constructhubs3storagefactory"></a>

Create s3 storage resources.

#### Methods <a name="Methods" id="methods"></a>

| **Name** | **Description** |
| --- | --- |
| [`newBucket`](#constructhubs3storagefactorynewbucket) | Create a new bucket in a storage config aware manner. |

---

##### `newBucket` <a name="construct-hub.S3StorageFactory.newBucket" id="constructhubs3storagefactorynewbucket"></a>

```typescript
public newBucket(scope: Construct, id: string, props?: BucketProps)
```

###### `scope`<sup>Required</sup> <a name="construct-hub.S3StorageFactory.parameter.scope" id="constructhubs3storagefactoryparameterscope"></a>

- *Type:* [`@aws-cdk/core.Construct`](#@aws-cdk/core.Construct)

---

###### `id`<sup>Required</sup> <a name="construct-hub.S3StorageFactory.parameter.id" id="constructhubs3storagefactoryparameterid"></a>

- *Type:* `string`

---

###### `props`<sup>Optional</sup> <a name="construct-hub.S3StorageFactory.parameter.props" id="constructhubs3storagefactoryparameterprops"></a>

- *Type:* [`@aws-cdk/aws-s3.BucketProps`](#@aws-cdk/aws-s3.BucketProps)

---

#### Static Functions <a name="Static Functions" id="static-functions"></a>

| **Name** | **Description** |
| --- | --- |
| [`getOrCreate`](#constructhubs3storagefactorygetorcreate) | Retrieve or create the storage factory for the current scope. |

---

##### `getOrCreate` <a name="construct-hub.S3StorageFactory.getOrCreate" id="constructhubs3storagefactorygetorcreate"></a>

```typescript
import { S3StorageFactory } from 'construct-hub'

S3StorageFactory.getOrCreate(scope: Construct, props?: S3StorageFactoryProps)
```

###### `scope`<sup>Required</sup> <a name="construct-hub.S3StorageFactory.parameter.scope" id="constructhubs3storagefactoryparameterscope"></a>

- *Type:* [`@aws-cdk/core.Construct`](#@aws-cdk/core.Construct)

---

###### `props`<sup>Optional</sup> <a name="construct-hub.S3StorageFactory.parameter.props" id="constructhubs3storagefactoryparameterprops"></a>

- *Type:* [`construct-hub.S3StorageFactoryProps`](#construct-hub.S3StorageFactoryProps)

---



## Structs <a name="Structs" id="structs"></a>

### AlarmActions <a name="construct-hub.AlarmActions" id="constructhubalarmactions"></a>

CloudWatch alarm actions to perform.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { AlarmActions } from 'construct-hub'

const alarmActions: AlarmActions = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`highSeverity`](#constructhubalarmactionspropertyhighseverity) | `string` | The ARN of the CloudWatch alarm action to take for alarms of high-severity alarms. |
| [`highSeverityAction`](#constructhubalarmactionspropertyhighseverityaction) | [`@aws-cdk/aws-cloudwatch.IAlarmAction`](#@aws-cdk/aws-cloudwatch.IAlarmAction) | The CloudWatch alarm action to take for alarms of high-severity alarms. |
| [`normalSeverity`](#constructhubalarmactionspropertynormalseverity) | `string` | The ARN of the CloudWatch alarm action to take for alarms of normal severity. |
| [`normalSeverityAction`](#constructhubalarmactionspropertynormalseverityaction) | [`@aws-cdk/aws-cloudwatch.IAlarmAction`](#@aws-cdk/aws-cloudwatch.IAlarmAction) | The CloudWatch alarm action to take for alarms of normal severity. |

---

##### `highSeverity`<sup>Optional</sup> <a name="construct-hub.AlarmActions.property.highSeverity" id="constructhubalarmactionspropertyhighseverity"></a>

```typescript
public readonly highSeverity: string;
```

- *Type:* `string`

The ARN of the CloudWatch alarm action to take for alarms of high-severity alarms.

This must be an ARN that can be used with CloudWatch alarms.

> https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions

---

##### `highSeverityAction`<sup>Optional</sup> <a name="construct-hub.AlarmActions.property.highSeverityAction" id="constructhubalarmactionspropertyhighseverityaction"></a>

```typescript
public readonly highSeverityAction: IAlarmAction;
```

- *Type:* [`@aws-cdk/aws-cloudwatch.IAlarmAction`](#@aws-cdk/aws-cloudwatch.IAlarmAction)

The CloudWatch alarm action to take for alarms of high-severity alarms.

This must be an ARN that can be used with CloudWatch alarms.

> https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions

---

##### `normalSeverity`<sup>Optional</sup> <a name="construct-hub.AlarmActions.property.normalSeverity" id="constructhubalarmactionspropertynormalseverity"></a>

```typescript
public readonly normalSeverity: string;
```

- *Type:* `string`
- *Default:* no actions are taken in response to alarms of normal severity

The ARN of the CloudWatch alarm action to take for alarms of normal severity.

This must be an ARN that can be used with CloudWatch alarms.

> https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions

---

##### `normalSeverityAction`<sup>Optional</sup> <a name="construct-hub.AlarmActions.property.normalSeverityAction" id="constructhubalarmactionspropertynormalseverityaction"></a>

```typescript
public readonly normalSeverityAction: IAlarmAction;
```

- *Type:* [`@aws-cdk/aws-cloudwatch.IAlarmAction`](#@aws-cdk/aws-cloudwatch.IAlarmAction)
- *Default:* no actions are taken in response to alarms of normal severity

The CloudWatch alarm action to take for alarms of normal severity.

This must be an ARN that can be used with CloudWatch alarms.

> https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-actions

---

### Category <a name="construct-hub.Category" id="constructhubcategory"></a>

A category of packages.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { Category } from 'construct-hub'

const category: Category = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`title`](#constructhubcategorypropertytitle)<span title="Required">*</span> | `string` | The title on the category button as it appears in the Construct Hub home page. |
| [`url`](#constructhubcategorypropertyurl)<span title="Required">*</span> | `string` | The URL that this category links to. |

---

##### `title`<sup>Required</sup> <a name="construct-hub.Category.property.title" id="constructhubcategorypropertytitle"></a>

```typescript
public readonly title: string;
```

- *Type:* `string`

The title on the category button as it appears in the Construct Hub home page.

---

##### `url`<sup>Required</sup> <a name="construct-hub.Category.property.url" id="constructhubcategorypropertyurl"></a>

```typescript
public readonly url: string;
```

- *Type:* `string`

The URL that this category links to.

This is the full path to the link that this category button will have. You can use any query options such as `?keywords=`, `?q=`, or a combination thereof.

---

### CodeArtifactDomainProps <a name="construct-hub.CodeArtifactDomainProps" id="constructhubcodeartifactdomainprops"></a>

Information pertaining to an existing CodeArtifact Domain.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { CodeArtifactDomainProps } from 'construct-hub'

const codeArtifactDomainProps: CodeArtifactDomainProps = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`name`](#constructhubcodeartifactdomainpropspropertyname)<span title="Required">*</span> | `string` | The name of the CodeArtifact domain. |
| [`upstreams`](#constructhubcodeartifactdomainpropspropertyupstreams) | `string`[] | Any upstream repositories in this CodeArtifact domain that should be configured on the internal CodeArtifact repository. |

---

##### `name`<sup>Required</sup> <a name="construct-hub.CodeArtifactDomainProps.property.name" id="constructhubcodeartifactdomainpropspropertyname"></a>

```typescript
public readonly name: string;
```

- *Type:* `string`

The name of the CodeArtifact domain.

---

##### `upstreams`<sup>Optional</sup> <a name="construct-hub.CodeArtifactDomainProps.property.upstreams" id="constructhubcodeartifactdomainpropspropertyupstreams"></a>

```typescript
public readonly upstreams: string[];
```

- *Type:* `string`[]

Any upstream repositories in this CodeArtifact domain that should be configured on the internal CodeArtifact repository.

---

### ConstructHubProps <a name="construct-hub.ConstructHubProps" id="constructhubconstructhubprops"></a>

Props for `ConstructHub`.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { ConstructHubProps } from 'construct-hub'

const constructHubProps: ConstructHubProps = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`additionalDomains`](#constructhubconstructhubpropspropertyadditionaldomains) | [`construct-hub.DomainRedirectSource`](#construct-hub.DomainRedirectSource)[] | Additional domains which will be set up to redirect to the primary construct hub domain. |
| [`alarmActions`](#constructhubconstructhubpropspropertyalarmactions) | [`construct-hub.AlarmActions`](#construct-hub.AlarmActions) | Actions to perform when alarms are set. |
| [`allowedLicenses`](#constructhubconstructhubpropspropertyallowedlicenses) | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)[] | The allowed licenses for packages indexed by this instance of ConstructHub. |
| [`backendDashboardName`](#constructhubconstructhubpropspropertybackenddashboardname) | `string` | The name of the CloudWatch dashboard that represents the health of backend systems. |
| [`categories`](#constructhubconstructhubpropspropertycategories) | [`construct-hub.Category`](#construct-hub.Category)[] | Browse categories. |
| [`codeArtifactDomain`](#constructhubconstructhubpropspropertycodeartifactdomain) | [`construct-hub.CodeArtifactDomainProps`](#construct-hub.CodeArtifactDomainProps) | When using a CodeArtifact package source, it is often desirable to have ConstructHub provision it's internal CodeArtifact repository in the same CodeArtifact domain, and to configure the package source repository as an upstream of the internal repository. |
| [`denyList`](#constructhubconstructhubpropspropertydenylist) | [`construct-hub.DenyListRule`](#construct-hub.DenyListRule)[] | A list of packages to block from the construct hub. |
| [`domain`](#constructhubconstructhubpropspropertydomain) | [`construct-hub.Domain`](#construct-hub.Domain) | Connect the hub to a domain (requires a hosted zone and a certificate). |
| [`failoverStorage`](#constructhubconstructhubpropspropertyfailoverstorage) | `boolean` | Wire construct hub to use the failover storage buckets. |
| [`featuredPackages`](#constructhubconstructhubpropspropertyfeaturedpackages) | [`construct-hub.FeaturedPackages`](#construct-hub.FeaturedPackages) | Configuration for packages to feature on the home page. |
| [`featureFlags`](#constructhubconstructhubpropspropertyfeatureflags) | [`construct-hub.FeatureFlags`](#construct-hub.FeatureFlags) | Configure feature flags for the web app. |
| [`fetchPackageStats`](#constructhubconstructhubpropspropertyfetchpackagestats) | `boolean` | Configure whether or not the backend should periodically query NPM for the number of downloads a package has in the past week, and display download counts on the web app. |
| [`isolateSensitiveTasks`](#constructhubconstructhubpropspropertyisolatesensitivetasks) | `boolean` | Whether compute environments for sensitive tasks (which operate on un-trusted complex data, such as the transliterator, which operates with externally-sourced npm package tarballs) should run in network-isolated environments. |
| [`logRetention`](#constructhubconstructhubpropspropertylogretention) | [`@aws-cdk/aws-logs.RetentionDays`](#@aws-cdk/aws-logs.RetentionDays) | How long to retain CloudWatch logs for. |
| [`packageLinks`](#constructhubconstructhubpropspropertypackagelinks) | [`construct-hub.PackageLinkConfig`](#construct-hub.PackageLinkConfig)[] | Configuration for custom package page links. |
| [`packageSources`](#constructhubconstructhubpropspropertypackagesources) | [`construct-hub.IPackageSource`](#construct-hub.IPackageSource)[] | The package sources to register with this ConstructHub instance. |
| [`packageTags`](#constructhubconstructhubpropspropertypackagetags) | [`construct-hub.PackageTag`](#construct-hub.PackageTag)[] | Configuration for custom package tags. |
| [`reprocessFrequency`](#constructhubconstructhubpropspropertyreprocessfrequency) | [`@aws-cdk/core.Duration`](#@aws-cdk/core.Duration) | How frequently all packages should get fully reprocessed. Set to 0 to disable automatic re-processing. |
| [`sensitiveTaskIsolation`](#constructhubconstructhubpropspropertysensitivetaskisolation) | [`construct-hub.Isolation`](#construct-hub.Isolation) | Whether compute environments for sensitive tasks (which operate on un-trusted complex data, such as the transliterator, which operates with externally-sourced npm package tarballs) should run in network-isolated environments. |

---

##### `additionalDomains`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.additionalDomains" id="constructhubconstructhubpropspropertyadditionaldomains"></a>

```typescript
public readonly additionalDomains: DomainRedirectSource[];
```

- *Type:* [`construct-hub.DomainRedirectSource`](#construct-hub.DomainRedirectSource)[]
- *Default:* []

Additional domains which will be set up to redirect to the primary construct hub domain.

---

##### `alarmActions`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.alarmActions" id="constructhubconstructhubpropspropertyalarmactions"></a>

```typescript
public readonly alarmActions: AlarmActions;
```

- *Type:* [`construct-hub.AlarmActions`](#construct-hub.AlarmActions)

Actions to perform when alarms are set.

---

##### `allowedLicenses`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.allowedLicenses" id="constructhubconstructhubpropspropertyallowedlicenses"></a>

```typescript
public readonly allowedLicenses: SpdxLicense[];
```

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)[]
- *Default:* [...SpdxLicense.apache(),...SpdxLicense.bsd(),...SpdxLicense.cddl(),...SpdxLicense.epl(),SpdxLicense.ISC,...SpdxLicense.mit(),SpdxLicense.MPL_2_0]

The allowed licenses for packages indexed by this instance of ConstructHub.

---

##### `backendDashboardName`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.backendDashboardName" id="constructhubconstructhubpropspropertybackenddashboardname"></a>

```typescript
public readonly backendDashboardName: string;
```

- *Type:* `string`

The name of the CloudWatch dashboard that represents the health of backend systems.

---

##### `categories`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.categories" id="constructhubconstructhubpropspropertycategories"></a>

```typescript
public readonly categories: Category[];
```

- *Type:* [`construct-hub.Category`](#construct-hub.Category)[]

Browse categories.

Each category will appear in the home page as a button with a link to the relevant search query.

---

##### `codeArtifactDomain`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.codeArtifactDomain" id="constructhubconstructhubpropspropertycodeartifactdomain"></a>

```typescript
public readonly codeArtifactDomain: CodeArtifactDomainProps;
```

- *Type:* [`construct-hub.CodeArtifactDomainProps`](#construct-hub.CodeArtifactDomainProps)
- *Default:* none.

When using a CodeArtifact package source, it is often desirable to have ConstructHub provision it's internal CodeArtifact repository in the same CodeArtifact domain, and to configure the package source repository as an upstream of the internal repository.

This way, all packages in the source are available to ConstructHub's backend processing.

---

##### `denyList`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.denyList" id="constructhubconstructhubpropspropertydenylist"></a>

```typescript
public readonly denyList: DenyListRule[];
```

- *Type:* [`construct-hub.DenyListRule`](#construct-hub.DenyListRule)[]
- *Default:* []

A list of packages to block from the construct hub.

---

##### `domain`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.domain" id="constructhubconstructhubpropspropertydomain"></a>

```typescript
public readonly domain: Domain;
```

- *Type:* [`construct-hub.Domain`](#construct-hub.Domain)

Connect the hub to a domain (requires a hosted zone and a certificate).

---

##### `failoverStorage`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.failoverStorage" id="constructhubconstructhubpropspropertyfailoverstorage"></a>

```typescript
public readonly failoverStorage: boolean;
```

- *Type:* `boolean`
- *Default:* false

Wire construct hub to use the failover storage buckets.

Do not activate this property until you've populated your failover buckets with the necessary data.

> https://github.com/cdklabs/construct-hub/blob/dev/docs/operator-runbook.md#storage-disaster

---

##### `featuredPackages`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.featuredPackages" id="constructhubconstructhubpropspropertyfeaturedpackages"></a>

```typescript
public readonly featuredPackages: FeaturedPackages;
```

- *Type:* [`construct-hub.FeaturedPackages`](#construct-hub.FeaturedPackages)
- *Default:* Display the 10 most recently updated packages

Configuration for packages to feature on the home page.

---

##### `featureFlags`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.featureFlags" id="constructhubconstructhubpropspropertyfeatureflags"></a>

```typescript
public readonly featureFlags: FeatureFlags;
```

- *Type:* [`construct-hub.FeatureFlags`](#construct-hub.FeatureFlags)

Configure feature flags for the web app.

---

##### `fetchPackageStats`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.fetchPackageStats" id="constructhubconstructhubpropspropertyfetchpackagestats"></a>

```typescript
public readonly fetchPackageStats: boolean;
```

- *Type:* `boolean`
- *Default:* true if packageSources is not specified (the defaults are used), false otherwise

Configure whether or not the backend should periodically query NPM for the number of downloads a package has in the past week, and display download counts on the web app.

---

##### ~~`isolateSensitiveTasks`~~<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.isolateSensitiveTasks" id="constructhubconstructhubpropspropertyisolatesensitivetasks"></a>

- *Deprecated:* use sensitiveTaskIsolation instead.

```typescript
public readonly isolateSensitiveTasks: boolean;
```

- *Type:* `boolean`

Whether compute environments for sensitive tasks (which operate on un-trusted complex data, such as the transliterator, which operates with externally-sourced npm package tarballs) should run in network-isolated environments.

This implies the creation of additonal resources, including:  - A VPC with only isolated subnets. - VPC Endpoints (CloudWatch Logs, CodeArtifact, CodeArtifact API, S3, ...) - A CodeArtifact Repository with an external connection to npmjs.com

---

##### `logRetention`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.logRetention" id="constructhubconstructhubpropspropertylogretention"></a>

```typescript
public readonly logRetention: RetentionDays;
```

- *Type:* [`@aws-cdk/aws-logs.RetentionDays`](#@aws-cdk/aws-logs.RetentionDays)

How long to retain CloudWatch logs for.

---

##### `packageLinks`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.packageLinks" id="constructhubconstructhubpropspropertypackagelinks"></a>

```typescript
public readonly packageLinks: PackageLinkConfig[];
```

- *Type:* [`construct-hub.PackageLinkConfig`](#construct-hub.PackageLinkConfig)[]

Configuration for custom package page links.

---

##### `packageSources`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.packageSources" id="constructhubconstructhubpropspropertypackagesources"></a>

```typescript
public readonly packageSources: IPackageSource[];
```

- *Type:* [`construct-hub.IPackageSource`](#construct-hub.IPackageSource)[]
- *Default:* a standard npmjs.com package source will be configured.

The package sources to register with this ConstructHub instance.

---

##### `packageTags`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.packageTags" id="constructhubconstructhubpropspropertypackagetags"></a>

```typescript
public readonly packageTags: PackageTag[];
```

- *Type:* [`construct-hub.PackageTag`](#construct-hub.PackageTag)[]

Configuration for custom package tags.

---

##### `reprocessFrequency`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.reprocessFrequency" id="constructhubconstructhubpropspropertyreprocessfrequency"></a>

```typescript
public readonly reprocessFrequency: Duration;
```

- *Type:* [`@aws-cdk/core.Duration`](#@aws-cdk/core.Duration)
- *Default:* 1 day

How frequently all packages should get fully reprocessed. Set to 0 to disable automatic re-processing.

See the operator runbook for more information about reprocessing.

> https://github.com/cdklabs/construct-hub/blob/main/docs/operator-runbook.md

---

##### `sensitiveTaskIsolation`<sup>Optional</sup> <a name="construct-hub.ConstructHubProps.property.sensitiveTaskIsolation" id="constructhubconstructhubpropspropertysensitivetaskisolation"></a>

```typescript
public readonly sensitiveTaskIsolation: Isolation;
```

- *Type:* [`construct-hub.Isolation`](#construct-hub.Isolation)
- *Default:* Isolation.NO_INTERNET_ACCESS

Whether compute environments for sensitive tasks (which operate on un-trusted complex data, such as the transliterator, which operates with externally-sourced npm package tarballs) should run in network-isolated environments.

This implies the creation of additonal resources, including:  - A VPC with only isolated subnets. - VPC Endpoints (CloudWatch Logs, CodeArtifact, CodeArtifact API, S3, ...) - A CodeArtifact Repository with an external connection to npmjs.com

---

### DenyListMap <a name="construct-hub.DenyListMap" id="constructhubdenylistmap"></a>

The contents of the deny list file in S3.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { DenyListMap } from 'construct-hub'

const denyListMap: DenyListMap = { ... }
```


### DenyListRule <a name="construct-hub.DenyListRule" id="constructhubdenylistrule"></a>

An entry in the list of packages blocked from display in the construct hub.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { DenyListRule } from 'construct-hub'

const denyListRule: DenyListRule = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`packageName`](#constructhubdenylistrulepropertypackagename)<span title="Required">*</span> | `string` | The name of the package to block (npm). |
| [`reason`](#constructhubdenylistrulepropertyreason)<span title="Required">*</span> | `string` | The reason why this package/version is denied. |
| [`version`](#constructhubdenylistrulepropertyversion) | `string` | The package version to block (must be a valid version such as "1.0.3"). |

---

##### `packageName`<sup>Required</sup> <a name="construct-hub.DenyListRule.property.packageName" id="constructhubdenylistrulepropertypackagename"></a>

```typescript
public readonly packageName: string;
```

- *Type:* `string`

The name of the package to block (npm).

---

##### `reason`<sup>Required</sup> <a name="construct-hub.DenyListRule.property.reason" id="constructhubdenylistrulepropertyreason"></a>

```typescript
public readonly reason: string;
```

- *Type:* `string`

The reason why this package/version is denied.

This information will be emitted to the construct hub logs.

---

##### `version`<sup>Optional</sup> <a name="construct-hub.DenyListRule.property.version" id="constructhubdenylistrulepropertyversion"></a>

```typescript
public readonly version: string;
```

- *Type:* `string`
- *Default:* all versions of this package are blocked.

The package version to block (must be a valid version such as "1.0.3").

---

### Domain <a name="construct-hub.Domain" id="constructhubdomain"></a>

Domain configuration for the website.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { Domain } from 'construct-hub'

const domain: Domain = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`cert`](#constructhubdomainpropertycert)<span title="Required">*</span> | [`@aws-cdk/aws-certificatemanager.ICertificate`](#@aws-cdk/aws-certificatemanager.ICertificate) | The certificate to use for serving the Construct Hub over a custom domain. |
| [`zone`](#constructhubdomainpropertyzone)<span title="Required">*</span> | [`@aws-cdk/aws-route53.IHostedZone`](#@aws-cdk/aws-route53.IHostedZone) | The root domain name where this instance of Construct Hub will be served. |
| [`monitorCertificateExpiration`](#constructhubdomainpropertymonitorcertificateexpiration) | `boolean` | Whether the certificate should be monitored for expiration, meaning high severity alarms will be raised if it is due to expire in less than 45 days. |

---

##### `cert`<sup>Required</sup> <a name="construct-hub.Domain.property.cert" id="constructhubdomainpropertycert"></a>

```typescript
public readonly cert: ICertificate;
```

- *Type:* [`@aws-cdk/aws-certificatemanager.ICertificate`](#@aws-cdk/aws-certificatemanager.ICertificate)
- *Default:* a DNS-Validated certificate will be provisioned using the   provided `hostedZone`.

The certificate to use for serving the Construct Hub over a custom domain.

---

##### `zone`<sup>Required</sup> <a name="construct-hub.Domain.property.zone" id="constructhubdomainpropertyzone"></a>

```typescript
public readonly zone: IHostedZone;
```

- *Type:* [`@aws-cdk/aws-route53.IHostedZone`](#@aws-cdk/aws-route53.IHostedZone)

The root domain name where this instance of Construct Hub will be served.

---

##### `monitorCertificateExpiration`<sup>Optional</sup> <a name="construct-hub.Domain.property.monitorCertificateExpiration" id="constructhubdomainpropertymonitorcertificateexpiration"></a>

```typescript
public readonly monitorCertificateExpiration: boolean;
```

- *Type:* `boolean`
- *Default:* true

Whether the certificate should be monitored for expiration, meaning high severity alarms will be raised if it is due to expire in less than 45 days.

---

### DomainRedirectSource <a name="construct-hub.DomainRedirectSource" id="constructhubdomainredirectsource"></a>

Source domain of the redirect.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { DomainRedirectSource } from 'construct-hub'

const domainRedirectSource: DomainRedirectSource = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`hostedZone`](#constructhubdomainredirectsourcepropertyhostedzone)<span title="Required">*</span> | [`@aws-cdk/aws-route53.IHostedZone`](#@aws-cdk/aws-route53.IHostedZone) | The route53 zone which hosts the source domain. |
| [`certificate`](#constructhubdomainredirectsourcepropertycertificate) | [`@aws-cdk/aws-certificatemanager.ICertificate`](#@aws-cdk/aws-certificatemanager.ICertificate) | The ACM certificate to use for the CloudFront distribution. |

---

##### `hostedZone`<sup>Required</sup> <a name="construct-hub.DomainRedirectSource.property.hostedZone" id="constructhubdomainredirectsourcepropertyhostedzone"></a>

```typescript
public readonly hostedZone: IHostedZone;
```

- *Type:* [`@aws-cdk/aws-route53.IHostedZone`](#@aws-cdk/aws-route53.IHostedZone)

The route53 zone which hosts the source domain.

---

##### `certificate`<sup>Optional</sup> <a name="construct-hub.DomainRedirectSource.property.certificate" id="constructhubdomainredirectsourcepropertycertificate"></a>

```typescript
public readonly certificate: ICertificate;
```

- *Type:* [`@aws-cdk/aws-certificatemanager.ICertificate`](#@aws-cdk/aws-certificatemanager.ICertificate)
- *Default:* a certificate is created for this domain.

The ACM certificate to use for the CloudFront distribution.

---

### FeaturedPackages <a name="construct-hub.FeaturedPackages" id="constructhubfeaturedpackages"></a>

Configuration for packages to feature on the home page.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { FeaturedPackages } from 'construct-hub'

const featuredPackages: FeaturedPackages = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`sections`](#constructhubfeaturedpackagespropertysections)<span title="Required">*</span> | [`construct-hub.FeaturedPackagesSection`](#construct-hub.FeaturedPackagesSection)[] | Grouped sections of packages on the homepage. |

---

##### `sections`<sup>Required</sup> <a name="construct-hub.FeaturedPackages.property.sections" id="constructhubfeaturedpackagespropertysections"></a>

```typescript
public readonly sections: FeaturedPackagesSection[];
```

- *Type:* [`construct-hub.FeaturedPackagesSection`](#construct-hub.FeaturedPackagesSection)[]

Grouped sections of packages on the homepage.

---

### FeaturedPackagesDetail <a name="construct-hub.FeaturedPackagesDetail" id="constructhubfeaturedpackagesdetail"></a>

Customization options for a specific package on the home page.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { FeaturedPackagesDetail } from 'construct-hub'

const featuredPackagesDetail: FeaturedPackagesDetail = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`name`](#constructhubfeaturedpackagesdetailpropertyname)<span title="Required">*</span> | `string` | The name of the package. |
| [`comment`](#constructhubfeaturedpackagesdetailpropertycomment) | `string` | An additional comment to include with the package. |

---

##### `name`<sup>Required</sup> <a name="construct-hub.FeaturedPackagesDetail.property.name" id="constructhubfeaturedpackagesdetailpropertyname"></a>

```typescript
public readonly name: string;
```

- *Type:* `string`

The name of the package.

---

##### `comment`<sup>Optional</sup> <a name="construct-hub.FeaturedPackagesDetail.property.comment" id="constructhubfeaturedpackagesdetailpropertycomment"></a>

```typescript
public readonly comment: string;
```

- *Type:* `string`

An additional comment to include with the package.

---

### FeaturedPackagesSection <a name="construct-hub.FeaturedPackagesSection" id="constructhubfeaturedpackagessection"></a>

Customization options for one section of the home page.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { FeaturedPackagesSection } from 'construct-hub'

const featuredPackagesSection: FeaturedPackagesSection = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`name`](#constructhubfeaturedpackagessectionpropertyname)<span title="Required">*</span> | `string` | The name of the section (displayed as a header). |
| [`showLastUpdated`](#constructhubfeaturedpackagessectionpropertyshowlastupdated) | `number` | Show the N most recently updated packages in this section. |
| [`showPackages`](#constructhubfeaturedpackagessectionpropertyshowpackages) | [`construct-hub.FeaturedPackagesDetail`](#construct-hub.FeaturedPackagesDetail)[] | Show an explicit list of packages. |

---

##### `name`<sup>Required</sup> <a name="construct-hub.FeaturedPackagesSection.property.name" id="constructhubfeaturedpackagessectionpropertyname"></a>

```typescript
public readonly name: string;
```

- *Type:* `string`

The name of the section (displayed as a header).

---

##### `showLastUpdated`<sup>Optional</sup> <a name="construct-hub.FeaturedPackagesSection.property.showLastUpdated" id="constructhubfeaturedpackagessectionpropertyshowlastupdated"></a>

```typescript
public readonly showLastUpdated: number;
```

- *Type:* `number`

Show the N most recently updated packages in this section.

Cannot be used with `showPackages`.

---

##### `showPackages`<sup>Optional</sup> <a name="construct-hub.FeaturedPackagesSection.property.showPackages" id="constructhubfeaturedpackagessectionpropertyshowpackages"></a>

```typescript
public readonly showPackages: FeaturedPackagesDetail[];
```

- *Type:* [`construct-hub.FeaturedPackagesDetail`](#construct-hub.FeaturedPackagesDetail)[]

Show an explicit list of packages.

Cannot be used with `showLastUpdated`.

---

### FeatureFlags <a name="construct-hub.FeatureFlags" id="constructhubfeatureflags"></a>

Enable/disable features for the web app.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { FeatureFlags } from 'construct-hub'

const featureFlags: FeatureFlags = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`homeRedesign`](#constructhubfeatureflagspropertyhomeredesign) | `boolean` | *No description.* |
| [`searchRedesign`](#constructhubfeatureflagspropertysearchredesign) | `boolean` | *No description.* |

---

##### `homeRedesign`<sup>Optional</sup> <a name="construct-hub.FeatureFlags.property.homeRedesign" id="constructhubfeatureflagspropertyhomeredesign"></a>

```typescript
public readonly homeRedesign: boolean;
```

- *Type:* `boolean`

---

##### `searchRedesign`<sup>Optional</sup> <a name="construct-hub.FeatureFlags.property.searchRedesign" id="constructhubfeatureflagspropertysearchredesign"></a>

```typescript
public readonly searchRedesign: boolean;
```

- *Type:* `boolean`

---

### Highlight <a name="construct-hub.Highlight" id="constructhubhighlight"></a>

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { Highlight } from 'construct-hub'

const highlight: Highlight = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`label`](#constructhubhighlightpropertylabel)<span title="Required">*</span> | `string` | The label for the tag being applied. |
| [`color`](#constructhubhighlightpropertycolor) | `string` | The hex value string for the color of the tag when displayed. |
| [`icon`](#constructhubhighlightpropertyicon) | `string` | Icon displayed next to highlight on package card. |

---

##### `label`<sup>Required</sup> <a name="construct-hub.Highlight.property.label" id="constructhubhighlightpropertylabel"></a>

```typescript
public readonly label: string;
```

- *Type:* `string`

The label for the tag being applied.

---

##### `color`<sup>Optional</sup> <a name="construct-hub.Highlight.property.color" id="constructhubhighlightpropertycolor"></a>

```typescript
public readonly color: string;
```

- *Type:* `string`

The hex value string for the color of the tag when displayed.

---

##### `icon`<sup>Optional</sup> <a name="construct-hub.Highlight.property.icon" id="constructhubhighlightpropertyicon"></a>

```typescript
public readonly icon: string;
```

- *Type:* `string`

Icon displayed next to highlight on package card.

---

### Keyword <a name="construct-hub.Keyword" id="constructhubkeyword"></a>

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { Keyword } from 'construct-hub'

const keyword: Keyword = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`label`](#constructhubkeywordpropertylabel)<span title="Required">*</span> | `string` | The label for the tag being applied. |
| [`color`](#constructhubkeywordpropertycolor) | `string` | The hex value string for the color of the tag when displayed. |

---

##### `label`<sup>Required</sup> <a name="construct-hub.Keyword.property.label" id="constructhubkeywordpropertylabel"></a>

```typescript
public readonly label: string;
```

- *Type:* `string`

The label for the tag being applied.

---

##### `color`<sup>Optional</sup> <a name="construct-hub.Keyword.property.color" id="constructhubkeywordpropertycolor"></a>

```typescript
public readonly color: string;
```

- *Type:* `string`

The hex value string for the color of the tag when displayed.

---

### LinkedResource <a name="construct-hub.LinkedResource" id="constructhublinkedresource"></a>

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { LinkedResource } from 'construct-hub'

const linkedResource: LinkedResource = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`name`](#constructhublinkedresourcepropertyname)<span title="Required">*</span> | `string` | The name of the linked resource. |
| [`url`](#constructhublinkedresourcepropertyurl)<span title="Required">*</span> | `string` | The URL where the linked resource can be found. |
| [`primary`](#constructhublinkedresourcepropertyprimary) | `boolean` | Whether this is the primary resource of the bound package source. |

---

##### `name`<sup>Required</sup> <a name="construct-hub.LinkedResource.property.name" id="constructhublinkedresourcepropertyname"></a>

```typescript
public readonly name: string;
```

- *Type:* `string`

The name of the linked resource.

---

##### `url`<sup>Required</sup> <a name="construct-hub.LinkedResource.property.url" id="constructhublinkedresourcepropertyurl"></a>

```typescript
public readonly url: string;
```

- *Type:* `string`

The URL where the linked resource can be found.

---

##### `primary`<sup>Optional</sup> <a name="construct-hub.LinkedResource.property.primary" id="constructhublinkedresourcepropertyprimary"></a>

```typescript
public readonly primary: boolean;
```

- *Type:* `boolean`

Whether this is the primary resource of the bound package source.

It is not necessary that there is one, and there could be multiple primary resources. The buttons for those will be rendered with a different style on the dashboard.

---

### PackageLinkConfig <a name="construct-hub.PackageLinkConfig" id="constructhubpackagelinkconfig"></a>

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { PackageLinkConfig } from 'construct-hub'

const packageLinkConfig: PackageLinkConfig = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`configKey`](#constructhubpackagelinkconfigpropertyconfigkey)<span title="Required">*</span> | `string` | The location of the value inside the constructHub.packageLinks key of a module's package.json. |
| [`linkLabel`](#constructhubpackagelinkconfigpropertylinklabel)<span title="Required">*</span> | `string` | The name of the link, appears before the ":" on the website. |
| [`allowedDomains`](#constructhubpackagelinkconfigpropertyalloweddomains) | `string`[] | allowList of domains for this link. |
| [`linkText`](#constructhubpackagelinkconfigpropertylinktext) | `string` | optional text to display as the hyperlink text. |

---

##### `configKey`<sup>Required</sup> <a name="construct-hub.PackageLinkConfig.property.configKey" id="constructhubpackagelinkconfigpropertyconfigkey"></a>

```typescript
public readonly configKey: string;
```

- *Type:* `string`

The location of the value inside the constructHub.packageLinks key of a module's package.json.

---

##### `linkLabel`<sup>Required</sup> <a name="construct-hub.PackageLinkConfig.property.linkLabel" id="constructhubpackagelinkconfigpropertylinklabel"></a>

```typescript
public readonly linkLabel: string;
```

- *Type:* `string`

The name of the link, appears before the ":" on the website.

---

##### `allowedDomains`<sup>Optional</sup> <a name="construct-hub.PackageLinkConfig.property.allowedDomains" id="constructhubpackagelinkconfigpropertyalloweddomains"></a>

```typescript
public readonly allowedDomains: string[];
```

- *Type:* `string`[]
- *Default:* all domains allowed

allowList of domains for this link.

---

##### `linkText`<sup>Optional</sup> <a name="construct-hub.PackageLinkConfig.property.linkText" id="constructhubpackagelinkconfigpropertylinktext"></a>

```typescript
public readonly linkText: string;
```

- *Type:* `string`
- *Default:* the url of the link

optional text to display as the hyperlink text.

---

### PackageSourceBindOptions <a name="construct-hub.PackageSourceBindOptions" id="constructhubpackagesourcebindoptions"></a>

Options for binding a package source.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { PackageSourceBindOptions } from 'construct-hub'

const packageSourceBindOptions: PackageSourceBindOptions = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`baseUrl`](#constructhubpackagesourcebindoptionspropertybaseurl)<span title="Required">*</span> | `string` | The base URL of the bound ConstructHub instance. |
| [`ingestion`](#constructhubpackagesourcebindoptionspropertyingestion)<span title="Required">*</span> | [`@aws-cdk/aws-iam.IGrantable`](#@aws-cdk/aws-iam.IGrantable) | The `IGrantable` that will process downstream messages from the bound package source. |
| [`licenseList`](#constructhubpackagesourcebindoptionspropertylicenselist)<span title="Required">*</span> | [`construct-hub.ILicenseList`](#construct-hub.ILicenseList) | The license list applied by the bound Construct Hub instance. |
| [`monitoring`](#constructhubpackagesourcebindoptionspropertymonitoring)<span title="Required">*</span> | [`construct-hub.IMonitoring`](#construct-hub.IMonitoring) | The monitoring instance to use for registering alarms, etc. |
| [`queue`](#constructhubpackagesourcebindoptionspropertyqueue)<span title="Required">*</span> | [`@aws-cdk/aws-sqs.IQueue`](#@aws-cdk/aws-sqs.IQueue) | The SQS queue to which messages should be sent. |
| [`denyList`](#constructhubpackagesourcebindoptionspropertydenylist) | [`construct-hub.IDenyList`](#construct-hub.IDenyList) | The configured `DenyList` for the bound Construct Hub instance, if any. |
| [`repository`](#constructhubpackagesourcebindoptionspropertyrepository) | [`construct-hub.IRepository`](#construct-hub.IRepository) | The CodeArtifact repository that is internally used by ConstructHub. |

---

##### `baseUrl`<sup>Required</sup> <a name="construct-hub.PackageSourceBindOptions.property.baseUrl" id="constructhubpackagesourcebindoptionspropertybaseurl"></a>

```typescript
public readonly baseUrl: string;
```

- *Type:* `string`

The base URL of the bound ConstructHub instance.

---

##### `ingestion`<sup>Required</sup> <a name="construct-hub.PackageSourceBindOptions.property.ingestion" id="constructhubpackagesourcebindoptionspropertyingestion"></a>

```typescript
public readonly ingestion: IGrantable;
```

- *Type:* [`@aws-cdk/aws-iam.IGrantable`](#@aws-cdk/aws-iam.IGrantable)

The `IGrantable` that will process downstream messages from the bound package source.

It needs to be granted permissions to read package data from the URLs sent to the `queue`.

---

##### `licenseList`<sup>Required</sup> <a name="construct-hub.PackageSourceBindOptions.property.licenseList" id="constructhubpackagesourcebindoptionspropertylicenselist"></a>

```typescript
public readonly licenseList: ILicenseList;
```

- *Type:* [`construct-hub.ILicenseList`](#construct-hub.ILicenseList)

The license list applied by the bound Construct Hub instance.

This can be used to filter down the package only to those which will pass the license filter.

---

##### `monitoring`<sup>Required</sup> <a name="construct-hub.PackageSourceBindOptions.property.monitoring" id="constructhubpackagesourcebindoptionspropertymonitoring"></a>

```typescript
public readonly monitoring: IMonitoring;
```

- *Type:* [`construct-hub.IMonitoring`](#construct-hub.IMonitoring)

The monitoring instance to use for registering alarms, etc.

---

##### `queue`<sup>Required</sup> <a name="construct-hub.PackageSourceBindOptions.property.queue" id="constructhubpackagesourcebindoptionspropertyqueue"></a>

```typescript
public readonly queue: IQueue;
```

- *Type:* [`@aws-cdk/aws-sqs.IQueue`](#@aws-cdk/aws-sqs.IQueue)

The SQS queue to which messages should be sent.

Sent objects should match the package discovery schema.

---

##### `denyList`<sup>Optional</sup> <a name="construct-hub.PackageSourceBindOptions.property.denyList" id="constructhubpackagesourcebindoptionspropertydenylist"></a>

```typescript
public readonly denyList: IDenyList;
```

- *Type:* [`construct-hub.IDenyList`](#construct-hub.IDenyList)

The configured `DenyList` for the bound Construct Hub instance, if any.

---

##### `repository`<sup>Optional</sup> <a name="construct-hub.PackageSourceBindOptions.property.repository" id="constructhubpackagesourcebindoptionspropertyrepository"></a>

```typescript
public readonly repository: IRepository;
```

- *Type:* [`construct-hub.IRepository`](#construct-hub.IRepository)

The CodeArtifact repository that is internally used by ConstructHub.

This may be undefined if no CodeArtifact repository is internally used.

---

### PackageSourceBindResult <a name="construct-hub.PackageSourceBindResult" id="constructhubpackagesourcebindresult"></a>

The result of binding a package source.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { PackageSourceBindResult } from 'construct-hub'

const packageSourceBindResult: PackageSourceBindResult = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`dashboardWidgets`](#constructhubpackagesourcebindresultpropertydashboardwidgets)<span title="Required">*</span> | [`@aws-cdk/aws-cloudwatch.IWidget`](#@aws-cdk/aws-cloudwatch.IWidget)[][] | Widgets to add to the operator dashbaord for monitoring the health of the bound package source. |
| [`name`](#constructhubpackagesourcebindresultpropertyname)<span title="Required">*</span> | `string` | The name of the bound package source. |
| [`links`](#constructhubpackagesourcebindresultpropertylinks) | [`construct-hub.LinkedResource`](#construct-hub.LinkedResource)[] | An optional list of linked resources to be displayed on the monitoring dashboard. |

---

##### `dashboardWidgets`<sup>Required</sup> <a name="construct-hub.PackageSourceBindResult.property.dashboardWidgets" id="constructhubpackagesourcebindresultpropertydashboardwidgets"></a>

```typescript
public readonly dashboardWidgets: IWidget[][];
```

- *Type:* [`@aws-cdk/aws-cloudwatch.IWidget`](#@aws-cdk/aws-cloudwatch.IWidget)[][]

Widgets to add to the operator dashbaord for monitoring the health of the bound package source.

It is not necessary for this list of widgets to include a title section (this will be added automatically). One array represents a row of widgets on the dashboard.

---

##### `name`<sup>Required</sup> <a name="construct-hub.PackageSourceBindResult.property.name" id="constructhubpackagesourcebindresultpropertyname"></a>

```typescript
public readonly name: string;
```

- *Type:* `string`

The name of the bound package source.

It will be used to render operator dashboards (so it should be a meaningful identification of the source).

---

##### `links`<sup>Optional</sup> <a name="construct-hub.PackageSourceBindResult.property.links" id="constructhubpackagesourcebindresultpropertylinks"></a>

```typescript
public readonly links: LinkedResource[];
```

- *Type:* [`construct-hub.LinkedResource`](#construct-hub.LinkedResource)[]

An optional list of linked resources to be displayed on the monitoring dashboard.

---

### PackageTag <a name="construct-hub.PackageTag" id="constructhubpackagetag"></a>

Configuration for applying custom tags to relevant packages.

Custom tags are displayed on the package details page, and can be used for searching.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { PackageTag } from 'construct-hub'

const packageTag: PackageTag = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`id`](#constructhubpackagetagpropertyid)<span title="Required">*</span> | `string` | Identifier for tag, used for search. |
| [`highlight`](#constructhubpackagetagpropertyhighlight) | [`construct-hub.Highlight`](#construct-hub.Highlight) | Configuration for higlighting tag on package card. |
| [`keyword`](#constructhubpackagetagpropertykeyword) | [`construct-hub.Keyword`](#construct-hub.Keyword) | Configuration for showing tag as keyword. |
| [`searchFilter`](#constructhubpackagetagpropertysearchfilter) | [`construct-hub.SearchFilter`](#construct-hub.SearchFilter) | Configuration for showing tag as search filter. |
| [`condition`](#constructhubpackagetagpropertycondition)<span title="Required">*</span> | [`construct-hub.TagCondition`](#construct-hub.TagCondition) | The description of the logic that dictates whether the package has the tag applied. |

---

##### `id`<sup>Required</sup> <a name="construct-hub.PackageTag.property.id" id="constructhubpackagetagpropertyid"></a>

```typescript
public readonly id: string;
```

- *Type:* `string`

Identifier for tag, used for search.

Must be unique amongst tags.

---

##### `highlight`<sup>Optional</sup> <a name="construct-hub.PackageTag.property.highlight" id="constructhubpackagetagpropertyhighlight"></a>

```typescript
public readonly highlight: Highlight;
```

- *Type:* [`construct-hub.Highlight`](#construct-hub.Highlight)
- *Default:* don't highlight tag

Configuration for higlighting tag on package card.

---

##### `keyword`<sup>Optional</sup> <a name="construct-hub.PackageTag.property.keyword" id="constructhubpackagetagpropertykeyword"></a>

```typescript
public readonly keyword: Keyword;
```

- *Type:* [`construct-hub.Keyword`](#construct-hub.Keyword)
- *Default:* don't show tag in keyword list

Configuration for showing tag as keyword.

---

##### `searchFilter`<sup>Optional</sup> <a name="construct-hub.PackageTag.property.searchFilter" id="constructhubpackagetagpropertysearchfilter"></a>

```typescript
public readonly searchFilter: SearchFilter;
```

- *Type:* [`construct-hub.SearchFilter`](#construct-hub.SearchFilter)
- *Default:* don't show tag in search filters

Configuration for showing tag as search filter.

---

##### `condition`<sup>Required</sup> <a name="construct-hub.PackageTag.property.condition" id="constructhubpackagetagpropertycondition"></a>

```typescript
public readonly condition: TagCondition;
```

- *Type:* [`construct-hub.TagCondition`](#construct-hub.TagCondition)

The description of the logic that dictates whether the package has the tag applied.

---

### PackageTagBase <a name="construct-hub.PackageTagBase" id="constructhubpackagetagbase"></a>

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { PackageTagBase } from 'construct-hub'

const packageTagBase: PackageTagBase = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`id`](#constructhubpackagetagbasepropertyid)<span title="Required">*</span> | `string` | Identifier for tag, used for search. |
| [`highlight`](#constructhubpackagetagbasepropertyhighlight) | [`construct-hub.Highlight`](#construct-hub.Highlight) | Configuration for higlighting tag on package card. |
| [`keyword`](#constructhubpackagetagbasepropertykeyword) | [`construct-hub.Keyword`](#construct-hub.Keyword) | Configuration for showing tag as keyword. |
| [`searchFilter`](#constructhubpackagetagbasepropertysearchfilter) | [`construct-hub.SearchFilter`](#construct-hub.SearchFilter) | Configuration for showing tag as search filter. |

---

##### `id`<sup>Required</sup> <a name="construct-hub.PackageTagBase.property.id" id="constructhubpackagetagbasepropertyid"></a>

```typescript
public readonly id: string;
```

- *Type:* `string`

Identifier for tag, used for search.

Must be unique amongst tags.

---

##### `highlight`<sup>Optional</sup> <a name="construct-hub.PackageTagBase.property.highlight" id="constructhubpackagetagbasepropertyhighlight"></a>

```typescript
public readonly highlight: Highlight;
```

- *Type:* [`construct-hub.Highlight`](#construct-hub.Highlight)
- *Default:* don't highlight tag

Configuration for higlighting tag on package card.

---

##### `keyword`<sup>Optional</sup> <a name="construct-hub.PackageTagBase.property.keyword" id="constructhubpackagetagbasepropertykeyword"></a>

```typescript
public readonly keyword: Keyword;
```

- *Type:* [`construct-hub.Keyword`](#construct-hub.Keyword)
- *Default:* don't show tag in keyword list

Configuration for showing tag as keyword.

---

##### `searchFilter`<sup>Optional</sup> <a name="construct-hub.PackageTagBase.property.searchFilter" id="constructhubpackagetagbasepropertysearchfilter"></a>

```typescript
public readonly searchFilter: SearchFilter;
```

- *Type:* [`construct-hub.SearchFilter`](#construct-hub.SearchFilter)
- *Default:* don't show tag in search filters

Configuration for showing tag as search filter.

---

### PackageTagConfig <a name="construct-hub.PackageTagConfig" id="constructhubpackagetagconfig"></a>

Serialized tag declaration to be passed to lambdas via environment variables.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { PackageTagConfig } from 'construct-hub'

const packageTagConfig: PackageTagConfig = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`id`](#constructhubpackagetagconfigpropertyid)<span title="Required">*</span> | `string` | Identifier for tag, used for search. |
| [`highlight`](#constructhubpackagetagconfigpropertyhighlight) | [`construct-hub.Highlight`](#construct-hub.Highlight) | Configuration for higlighting tag on package card. |
| [`keyword`](#constructhubpackagetagconfigpropertykeyword) | [`construct-hub.Keyword`](#construct-hub.Keyword) | Configuration for showing tag as keyword. |
| [`searchFilter`](#constructhubpackagetagconfigpropertysearchfilter) | [`construct-hub.SearchFilter`](#construct-hub.SearchFilter) | Configuration for showing tag as search filter. |
| [`condition`](#constructhubpackagetagconfigpropertycondition)<span title="Required">*</span> | [`construct-hub.TagConditionConfig`](#construct-hub.TagConditionConfig) | *No description.* |

---

##### `id`<sup>Required</sup> <a name="construct-hub.PackageTagConfig.property.id" id="constructhubpackagetagconfigpropertyid"></a>

```typescript
public readonly id: string;
```

- *Type:* `string`

Identifier for tag, used for search.

Must be unique amongst tags.

---

##### `highlight`<sup>Optional</sup> <a name="construct-hub.PackageTagConfig.property.highlight" id="constructhubpackagetagconfigpropertyhighlight"></a>

```typescript
public readonly highlight: Highlight;
```

- *Type:* [`construct-hub.Highlight`](#construct-hub.Highlight)
- *Default:* don't highlight tag

Configuration for higlighting tag on package card.

---

##### `keyword`<sup>Optional</sup> <a name="construct-hub.PackageTagConfig.property.keyword" id="constructhubpackagetagconfigpropertykeyword"></a>

```typescript
public readonly keyword: Keyword;
```

- *Type:* [`construct-hub.Keyword`](#construct-hub.Keyword)
- *Default:* don't show tag in keyword list

Configuration for showing tag as keyword.

---

##### `searchFilter`<sup>Optional</sup> <a name="construct-hub.PackageTagConfig.property.searchFilter" id="constructhubpackagetagconfigpropertysearchfilter"></a>

```typescript
public readonly searchFilter: SearchFilter;
```

- *Type:* [`construct-hub.SearchFilter`](#construct-hub.SearchFilter)
- *Default:* don't show tag in search filters

Configuration for showing tag as search filter.

---

##### `condition`<sup>Required</sup> <a name="construct-hub.PackageTagConfig.property.condition" id="constructhubpackagetagconfigpropertycondition"></a>

```typescript
public readonly condition: TagConditionConfig;
```

- *Type:* [`construct-hub.TagConditionConfig`](#construct-hub.TagConditionConfig)

---

### S3StorageFactoryProps <a name="construct-hub.S3StorageFactoryProps" id="constructhubs3storagefactoryprops"></a>

Properties for `S3StorageFactory`.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { S3StorageFactoryProps } from 'construct-hub'

const s3StorageFactoryProps: S3StorageFactoryProps = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`failover`](#constructhubs3storagefactorypropspropertyfailover) | `boolean` | When enabled, the factory will return the failover buckets instead of the primary. |

---

##### `failover`<sup>Optional</sup> <a name="construct-hub.S3StorageFactoryProps.property.failover" id="constructhubs3storagefactorypropspropertyfailover"></a>

```typescript
public readonly failover: boolean;
```

- *Type:* `boolean`
- *Default:* false

When enabled, the factory will return the failover buckets instead of the primary.

---

### SearchFilter <a name="construct-hub.SearchFilter" id="constructhubsearchfilter"></a>

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { SearchFilter } from 'construct-hub'

const searchFilter: SearchFilter = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`display`](#constructhubsearchfilterpropertydisplay)<span title="Required">*</span> | `string` | Display name for filter. |
| [`groupBy`](#constructhubsearchfilterpropertygroupby)<span title="Required">*</span> | `string` | Name of group to include filter in. |

---

##### `display`<sup>Required</sup> <a name="construct-hub.SearchFilter.property.display" id="constructhubsearchfilterpropertydisplay"></a>

```typescript
public readonly display: string;
```

- *Type:* `string`

Display name for filter.

---

##### `groupBy`<sup>Required</sup> <a name="construct-hub.SearchFilter.property.groupBy" id="constructhubsearchfilterpropertygroupby"></a>

```typescript
public readonly groupBy: string;
```

- *Type:* `string`

Name of group to include filter in.

---

### TagConditionConfig <a name="construct-hub.TagConditionConfig" id="constructhubtagconditionconfig"></a>

Serialized config for a tag condition.

#### Initializer <a name="[object Object].Initializer" id="object-objectinitializer"></a>

```typescript
import { TagConditionConfig } from 'construct-hub'

const tagConditionConfig: TagConditionConfig = { ... }
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`type`](#constructhubtagconditionconfigpropertytype)<span title="Required">*</span> | [`construct-hub.TagConditionLogicType`](#construct-hub.TagConditionLogicType) | *No description.* |
| [`children`](#constructhubtagconditionconfigpropertychildren) | [`construct-hub.TagConditionConfig`](#construct-hub.TagConditionConfig)[] | *No description.* |
| [`key`](#constructhubtagconditionconfigpropertykey) | `string`[] | *No description.* |
| [`value`](#constructhubtagconditionconfigpropertyvalue) | `string` | *No description.* |

---

##### `type`<sup>Required</sup> <a name="construct-hub.TagConditionConfig.property.type" id="constructhubtagconditionconfigpropertytype"></a>

```typescript
public readonly type: TagConditionLogicType;
```

- *Type:* [`construct-hub.TagConditionLogicType`](#construct-hub.TagConditionLogicType)

---

##### `children`<sup>Optional</sup> <a name="construct-hub.TagConditionConfig.property.children" id="constructhubtagconditionconfigpropertychildren"></a>

```typescript
public readonly children: TagConditionConfig[];
```

- *Type:* [`construct-hub.TagConditionConfig`](#construct-hub.TagConditionConfig)[]

---

##### `key`<sup>Optional</sup> <a name="construct-hub.TagConditionConfig.property.key" id="constructhubtagconditionconfigpropertykey"></a>

```typescript
public readonly key: string[];
```

- *Type:* `string`[]

---

##### `value`<sup>Optional</sup> <a name="construct-hub.TagConditionConfig.property.value" id="constructhubtagconditionconfigpropertyvalue"></a>

```typescript
public readonly value: string;
```

- *Type:* `string`

---

## Classes <a name="Classes" id="classes"></a>

### SpdxLicense <a name="construct-hub.SpdxLicense" id="constructhubspdxlicense"></a>

Valid SPDX License identifiers.


#### Static Functions <a name="Static Functions" id="static-functions"></a>

| **Name** | **Description** |
| --- | --- |
| [`all`](#constructhubspdxlicenseall) | All valid SPDX Licenses. |
| [`apache`](#constructhubspdxlicenseapache) | The Apache family of licenses. |
| [`bsd`](#constructhubspdxlicensebsd) | The BSD family of licenses. |
| [`cddl`](#constructhubspdxlicensecddl) | The CDDL family of licenses. |
| [`epl`](#constructhubspdxlicenseepl) | The EPL family of licenses. |
| [`mit`](#constructhubspdxlicensemit) | The MIT family of licenses. |
| [`mpl`](#constructhubspdxlicensempl) | The MPL family of licenses. |
| [`osiApproved`](#constructhubspdxlicenseosiapproved) | All OSI-Approved SPDX Licenses. |

---

##### `all` <a name="construct-hub.SpdxLicense.all" id="constructhubspdxlicenseall"></a>

```typescript
import { SpdxLicense } from 'construct-hub'

SpdxLicense.all()
```

##### `apache` <a name="construct-hub.SpdxLicense.apache" id="constructhubspdxlicenseapache"></a>

```typescript
import { SpdxLicense } from 'construct-hub'

SpdxLicense.apache()
```

##### `bsd` <a name="construct-hub.SpdxLicense.bsd" id="constructhubspdxlicensebsd"></a>

```typescript
import { SpdxLicense } from 'construct-hub'

SpdxLicense.bsd()
```

##### `cddl` <a name="construct-hub.SpdxLicense.cddl" id="constructhubspdxlicensecddl"></a>

```typescript
import { SpdxLicense } from 'construct-hub'

SpdxLicense.cddl()
```

##### `epl` <a name="construct-hub.SpdxLicense.epl" id="constructhubspdxlicenseepl"></a>

```typescript
import { SpdxLicense } from 'construct-hub'

SpdxLicense.epl()
```

##### `mit` <a name="construct-hub.SpdxLicense.mit" id="constructhubspdxlicensemit"></a>

```typescript
import { SpdxLicense } from 'construct-hub'

SpdxLicense.mit()
```

##### `mpl` <a name="construct-hub.SpdxLicense.mpl" id="constructhubspdxlicensempl"></a>

```typescript
import { SpdxLicense } from 'construct-hub'

SpdxLicense.mpl()
```

##### `osiApproved` <a name="construct-hub.SpdxLicense.osiApproved" id="constructhubspdxlicenseosiapproved"></a>

```typescript
import { SpdxLicense } from 'construct-hub'

SpdxLicense.osiApproved()
```

#### Properties <a name="Properties" id="properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`id`](#constructhubspdxlicensepropertyid)<span title="Required">*</span> | `string` | *No description.* |

---

##### `id`<sup>Required</sup> <a name="construct-hub.SpdxLicense.property.id" id="constructhubspdxlicensepropertyid"></a>

```typescript
public readonly id: string;
```

- *Type:* `string`

---

#### Constants <a name="Constants" id="constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`AAL`](#constructhubspdxlicensepropertyaal)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Attribution Assurance License. |
| [`ABSTYLES`](#constructhubspdxlicensepropertyabstyles)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Abstyles License. |
| [`ADOBE_2006`](#constructhubspdxlicensepropertyadobe2006)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Adobe Systems Incorporated Source Code License Agreement. |
| [`ADOBE_GLYPH`](#constructhubspdxlicensepropertyadobeglyph)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Adobe Glyph List License. |
| [`ADSL`](#constructhubspdxlicensepropertyadsl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Amazon Digital Services License. |
| [`AFL_1_1`](#constructhubspdxlicensepropertyafl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Academic Free License v1.1. |
| [`AFL_1_2`](#constructhubspdxlicensepropertyafl12)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Academic Free License v1.2. |
| [`AFL_2_0`](#constructhubspdxlicensepropertyafl20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Academic Free License v2.0. |
| [`AFL_2_1`](#constructhubspdxlicensepropertyafl21)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Academic Free License v2.1. |
| [`AFL_3_0`](#constructhubspdxlicensepropertyafl30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Academic Free License v3.0. |
| [`AFMPARSE`](#constructhubspdxlicensepropertyafmparse)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Afmparse License. |
| [`AGPL_1_0`](#constructhubspdxlicensepropertyagpl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Affero General Public License v1.0. |
| [`AGPL_1_0_ONLY`](#constructhubspdxlicensepropertyagpl10only)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Affero General Public License v1.0 only. |
| [`AGPL_1_0_OR_LATER`](#constructhubspdxlicensepropertyagpl10orlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Affero General Public License v1.0 or later. |
| [`AGPL_3_0`](#constructhubspdxlicensepropertyagpl30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Affero General Public License v3.0. |
| [`AGPL_3_0_ONLY`](#constructhubspdxlicensepropertyagpl30only)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Affero General Public License v3.0 only. |
| [`AGPL_3_0_OR_LATER`](#constructhubspdxlicensepropertyagpl30orlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Affero General Public License v3.0 or later. |
| [`ALADDIN`](#constructhubspdxlicensepropertyaladdin)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Aladdin Free Public License. |
| [`AMDPLPA`](#constructhubspdxlicensepropertyamdplpa)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | AMD's plpa_map.c License. |
| [`AML`](#constructhubspdxlicensepropertyaml)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Apple MIT License. |
| [`AMPAS`](#constructhubspdxlicensepropertyampas)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Academy of Motion Picture Arts and Sciences BSD. |
| [`ANTLR_PD`](#constructhubspdxlicensepropertyantlrpd)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | ANTLR Software Rights Notice. |
| [`ANTLR_PD_FALLBACK`](#constructhubspdxlicensepropertyantlrpdfallback)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | ANTLR Software Rights Notice with license fallback. |
| [`APACHE_1_0`](#constructhubspdxlicensepropertyapache10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Apache License 1.0. |
| [`APACHE_1_1`](#constructhubspdxlicensepropertyapache11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Apache License 1.1. |
| [`APACHE_2_0`](#constructhubspdxlicensepropertyapache20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Apache License 2.0. |
| [`APAFML`](#constructhubspdxlicensepropertyapafml)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Adobe Postscript AFM License. |
| [`APL_1_0`](#constructhubspdxlicensepropertyapl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Adaptive Public License 1.0. |
| [`APSL_1_0`](#constructhubspdxlicensepropertyapsl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Apple Public Source License 1.0. |
| [`APSL_1_1`](#constructhubspdxlicensepropertyapsl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Apple Public Source License 1.1. |
| [`APSL_1_2`](#constructhubspdxlicensepropertyapsl12)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Apple Public Source License 1.2. |
| [`APSL_2_0`](#constructhubspdxlicensepropertyapsl20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Apple Public Source License 2.0. |
| [`ARTISTIC_1_0`](#constructhubspdxlicensepropertyartistic10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Artistic License 1.0. |
| [`ARTISTIC_1_0_CL8`](#constructhubspdxlicensepropertyartistic10cl8)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Artistic License 1.0 w/clause 8. |
| [`ARTISTIC_1_0_PERL`](#constructhubspdxlicensepropertyartistic10perl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Artistic License 1.0 (Perl). |
| [`ARTISTIC_2_0`](#constructhubspdxlicensepropertyartistic20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Artistic License 2.0. |
| [`BAHYPH`](#constructhubspdxlicensepropertybahyph)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Bahyph License. |
| [`BARR`](#constructhubspdxlicensepropertybarr)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Barr License. |
| [`BEERWARE`](#constructhubspdxlicensepropertybeerware)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Beerware License. |
| [`BITTORRENT_1_0`](#constructhubspdxlicensepropertybittorrent10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BitTorrent Open Source License v1.0. |
| [`BITTORRENT_1_1`](#constructhubspdxlicensepropertybittorrent11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BitTorrent Open Source License v1.1. |
| [`BLESSING`](#constructhubspdxlicensepropertyblessing)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SQLite Blessing. |
| [`BLUEOAK_1_0_0`](#constructhubspdxlicensepropertyblueoak100)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Blue Oak Model License 1.0.0. |
| [`BORCEUX`](#constructhubspdxlicensepropertyborceux)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Borceux license. |
| [`BSD_1_CLAUSE`](#constructhubspdxlicensepropertybsd1clause)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD 1-Clause License. |
| [`BSD_2_CLAUSE`](#constructhubspdxlicensepropertybsd2clause)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD 2-Clause "Simplified" License. |
| [`BSD_2_CLAUSE_FREEBSD`](#constructhubspdxlicensepropertybsd2clausefreebsd)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD 2-Clause FreeBSD License. |
| [`BSD_2_CLAUSE_NETBSD`](#constructhubspdxlicensepropertybsd2clausenetbsd)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD 2-Clause NetBSD License. |
| [`BSD_2_CLAUSE_PATENT`](#constructhubspdxlicensepropertybsd2clausepatent)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD-2-Clause Plus Patent License. |
| [`BSD_2_CLAUSE_VIEWS`](#constructhubspdxlicensepropertybsd2clauseviews)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD 2-Clause with views sentence. |
| [`BSD_3_CLAUSE`](#constructhubspdxlicensepropertybsd3clause)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD 3-Clause "New" or "Revised" License. |
| [`BSD_3_CLAUSE_ATTRIBUTION`](#constructhubspdxlicensepropertybsd3clauseattribution)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD with attribution. |
| [`BSD_3_CLAUSE_CLEAR`](#constructhubspdxlicensepropertybsd3clauseclear)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD 3-Clause Clear License. |
| [`BSD_3_CLAUSE_LBNL`](#constructhubspdxlicensepropertybsd3clauselbnl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Lawrence Berkeley National Labs BSD variant license. |
| [`BSD_3_CLAUSE_NO_NUCLEAR_LICENSE`](#constructhubspdxlicensepropertybsd3clausenonuclearlicense)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD 3-Clause No Nuclear License. |
| [`BSD_3_CLAUSE_NO_NUCLEAR_LICENSE_2014`](#constructhubspdxlicensepropertybsd3clausenonuclearlicense2014)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD 3-Clause No Nuclear License 2014. |
| [`BSD_3_CLAUSE_NO_NUCLEAR_WARRANTY`](#constructhubspdxlicensepropertybsd3clausenonuclearwarranty)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD 3-Clause No Nuclear Warranty. |
| [`BSD_3_CLAUSE_OPEN_MPI`](#constructhubspdxlicensepropertybsd3clauseopenmpi)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD 3-Clause Open MPI variant. |
| [`BSD_4_CLAUSE`](#constructhubspdxlicensepropertybsd4clause)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD 4-Clause "Original" or "Old" License. |
| [`BSD_4_CLAUSE_UC`](#constructhubspdxlicensepropertybsd4clauseuc)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD-4-Clause (University of California-Specific). |
| [`BSD_PROTECTION`](#constructhubspdxlicensepropertybsdprotection)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD Protection License. |
| [`BSD_SOURCE_CODE`](#constructhubspdxlicensepropertybsdsourcecode)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD Source Code Attribution. |
| [`BSL_1_0`](#constructhubspdxlicensepropertybsl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Boost Software License 1.0. |
| [`BUSL_1_1`](#constructhubspdxlicensepropertybusl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Business Source License 1.1. |
| [`BZIP2_1_0_5`](#constructhubspdxlicensepropertybzip2105)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | bzip2 and libbzip2 License v1.0.5. |
| [`BZIP2_1_0_6`](#constructhubspdxlicensepropertybzip2106)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | bzip2 and libbzip2 License v1.0.6. |
| [`CAL_1_0`](#constructhubspdxlicensepropertycal10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Cryptographic Autonomy License 1.0. |
| [`CAL_1_0_COMBINED_WORK_EXCEPTION`](#constructhubspdxlicensepropertycal10combinedworkexception)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Cryptographic Autonomy License 1.0 (Combined Work Exception). |
| [`CALDERA`](#constructhubspdxlicensepropertycaldera)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Caldera License. |
| [`CATOSL_1_1`](#constructhubspdxlicensepropertycatosl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Computer Associates Trusted Open Source License 1.1. |
| [`CC_BY_1_0`](#constructhubspdxlicensepropertyccby10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution 1.0 Generic. |
| [`CC_BY_2_0`](#constructhubspdxlicensepropertyccby20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution 2.0 Generic. |
| [`CC_BY_2_5`](#constructhubspdxlicensepropertyccby25)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution 2.5 Generic. |
| [`CC_BY_3_0`](#constructhubspdxlicensepropertyccby30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution 3.0 Unported. |
| [`CC_BY_3_0_AT`](#constructhubspdxlicensepropertyccby30at)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution 3.0 Austria. |
| [`CC_BY_3_0_US`](#constructhubspdxlicensepropertyccby30us)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution 3.0 United States. |
| [`CC_BY_4_0`](#constructhubspdxlicensepropertyccby40)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution 4.0 International. |
| [`CC_BY_NC_1_0`](#constructhubspdxlicensepropertyccbync10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial 1.0 Generic. |
| [`CC_BY_NC_2_0`](#constructhubspdxlicensepropertyccbync20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial 2.0 Generic. |
| [`CC_BY_NC_2_5`](#constructhubspdxlicensepropertyccbync25)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial 2.5 Generic. |
| [`CC_BY_NC_3_0`](#constructhubspdxlicensepropertyccbync30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial 3.0 Unported. |
| [`CC_BY_NC_4_0`](#constructhubspdxlicensepropertyccbync40)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial 4.0 International. |
| [`CC_BY_NC_ND_1_0`](#constructhubspdxlicensepropertyccbyncnd10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial No Derivatives 1.0 Generic. |
| [`CC_BY_NC_ND_2_0`](#constructhubspdxlicensepropertyccbyncnd20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial No Derivatives 2.0 Generic. |
| [`CC_BY_NC_ND_2_5`](#constructhubspdxlicensepropertyccbyncnd25)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial No Derivatives 2.5 Generic. |
| [`CC_BY_NC_ND_3_0`](#constructhubspdxlicensepropertyccbyncnd30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial No Derivatives 3.0 Unported. |
| [`CC_BY_NC_ND_3_0_IGO`](#constructhubspdxlicensepropertyccbyncnd30igo)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial No Derivatives 3.0 IGO. |
| [`CC_BY_NC_ND_4_0`](#constructhubspdxlicensepropertyccbyncnd40)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial No Derivatives 4.0 International. |
| [`CC_BY_NC_SA_1_0`](#constructhubspdxlicensepropertyccbyncsa10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial Share Alike 1.0 Generic. |
| [`CC_BY_NC_SA_2_0`](#constructhubspdxlicensepropertyccbyncsa20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial Share Alike 2.0 Generic. |
| [`CC_BY_NC_SA_2_5`](#constructhubspdxlicensepropertyccbyncsa25)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial Share Alike 2.5 Generic. |
| [`CC_BY_NC_SA_3_0`](#constructhubspdxlicensepropertyccbyncsa30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial Share Alike 3.0 Unported. |
| [`CC_BY_NC_SA_4_0`](#constructhubspdxlicensepropertyccbyncsa40)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Non Commercial Share Alike 4.0 International. |
| [`CC_BY_ND_1_0`](#constructhubspdxlicensepropertyccbynd10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution No Derivatives 1.0 Generic. |
| [`CC_BY_ND_2_0`](#constructhubspdxlicensepropertyccbynd20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution No Derivatives 2.0 Generic. |
| [`CC_BY_ND_2_5`](#constructhubspdxlicensepropertyccbynd25)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution No Derivatives 2.5 Generic. |
| [`CC_BY_ND_3_0`](#constructhubspdxlicensepropertyccbynd30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution No Derivatives 3.0 Unported. |
| [`CC_BY_ND_4_0`](#constructhubspdxlicensepropertyccbynd40)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution No Derivatives 4.0 International. |
| [`CC_BY_SA_1_0`](#constructhubspdxlicensepropertyccbysa10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Share Alike 1.0 Generic. |
| [`CC_BY_SA_2_0`](#constructhubspdxlicensepropertyccbysa20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Share Alike 2.0 Generic. |
| [`CC_BY_SA_2_0_UK`](#constructhubspdxlicensepropertyccbysa20uk)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Share Alike 2.0 England and Wales. |
| [`CC_BY_SA_2_5`](#constructhubspdxlicensepropertyccbysa25)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Share Alike 2.5 Generic. |
| [`CC_BY_SA_3_0`](#constructhubspdxlicensepropertyccbysa30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Share Alike 3.0 Unported. |
| [`CC_BY_SA_3_0_AT`](#constructhubspdxlicensepropertyccbysa30at)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution-Share Alike 3.0 Austria. |
| [`CC_BY_SA_4_0`](#constructhubspdxlicensepropertyccbysa40)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Attribution Share Alike 4.0 International. |
| [`CC_PDDC`](#constructhubspdxlicensepropertyccpddc)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Public Domain Dedication and Certification. |
| [`CC0_1_0`](#constructhubspdxlicensepropertycc010)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Creative Commons Zero v1.0 Universal. |
| [`CDDL_1_0`](#constructhubspdxlicensepropertycddl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Common Development and Distribution License 1.0. |
| [`CDDL_1_1`](#constructhubspdxlicensepropertycddl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Common Development and Distribution License 1.1. |
| [`CDLA_PERMISSIVE_1_0`](#constructhubspdxlicensepropertycdlapermissive10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Community Data License Agreement Permissive 1.0. |
| [`CDLA_SHARING_1_0`](#constructhubspdxlicensepropertycdlasharing10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Community Data License Agreement Sharing 1.0. |
| [`CECILL_1_0`](#constructhubspdxlicensepropertycecill10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CeCILL Free Software License Agreement v1.0. |
| [`CECILL_1_1`](#constructhubspdxlicensepropertycecill11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CeCILL Free Software License Agreement v1.1. |
| [`CECILL_2_0`](#constructhubspdxlicensepropertycecill20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CeCILL Free Software License Agreement v2.0. |
| [`CECILL_2_1`](#constructhubspdxlicensepropertycecill21)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CeCILL Free Software License Agreement v2.1. |
| [`CECILL_B`](#constructhubspdxlicensepropertycecillb)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CeCILL-B Free Software License Agreement. |
| [`CECILL_C`](#constructhubspdxlicensepropertycecillc)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CeCILL-C Free Software License Agreement. |
| [`CERN_OHL_1_1`](#constructhubspdxlicensepropertycernohl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CERN Open Hardware Licence v1.1. |
| [`CERN_OHL_1_2`](#constructhubspdxlicensepropertycernohl12)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CERN Open Hardware Licence v1.2. |
| [`CERN_OHL_P_2_0`](#constructhubspdxlicensepropertycernohlp20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CERN Open Hardware Licence Version 2 - Permissive. |
| [`CERN_OHL_S_2_0`](#constructhubspdxlicensepropertycernohls20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CERN Open Hardware Licence Version 2 - Strongly Reciprocal. |
| [`CERN_OHL_W_2_0`](#constructhubspdxlicensepropertycernohlw20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CERN Open Hardware Licence Version 2 - Weakly Reciprocal. |
| [`CL_ARTISTIC`](#constructhubspdxlicensepropertyclartistic)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Clarified Artistic License. |
| [`CNRI_JYTHON`](#constructhubspdxlicensepropertycnrijython)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CNRI Jython License. |
| [`CNRI_PYTHON`](#constructhubspdxlicensepropertycnripython)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CNRI Python License. |
| [`CNRI_PYTHON_GPL_COMPATIBLE`](#constructhubspdxlicensepropertycnripythongplcompatible)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CNRI Python Open Source GPL Compatible License Agreement. |
| [`CONDOR_1_1`](#constructhubspdxlicensepropertycondor11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Condor Public License v1.1. |
| [`COPYLEFT_NEXT_0_3_0`](#constructhubspdxlicensepropertycopyleftnext030)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | copyleft-next 0.3.0. |
| [`COPYLEFT_NEXT_0_3_1`](#constructhubspdxlicensepropertycopyleftnext031)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | copyleft-next 0.3.1. |
| [`CPAL_1_0`](#constructhubspdxlicensepropertycpal10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Common Public Attribution License 1.0. |
| [`CPL_1_0`](#constructhubspdxlicensepropertycpl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Common Public License 1.0. |
| [`CPOL_1_02`](#constructhubspdxlicensepropertycpol102)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Code Project Open License 1.02. |
| [`CROSSWORD`](#constructhubspdxlicensepropertycrossword)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Crossword License. |
| [`CRYSTAL_STACKER`](#constructhubspdxlicensepropertycrystalstacker)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CrystalStacker License. |
| [`CUA_OPL_1_0`](#constructhubspdxlicensepropertycuaopl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CUA Office Public License v1.0. |
| [`CUBE`](#constructhubspdxlicensepropertycube)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Cube License. |
| [`CURL`](#constructhubspdxlicensepropertycurl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | curl License. |
| [`D_FSL_1_0`](#constructhubspdxlicensepropertydfsl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Deutsche Freie Software Lizenz. |
| [`DIFFMARK`](#constructhubspdxlicensepropertydiffmark)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | diffmark license. |
| [`DOC`](#constructhubspdxlicensepropertydoc)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | DOC License. |
| [`DOTSEQN`](#constructhubspdxlicensepropertydotseqn)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Dotseqn License. |
| [`DSDP`](#constructhubspdxlicensepropertydsdp)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | DSDP License. |
| [`DVIPDFM`](#constructhubspdxlicensepropertydvipdfm)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | dvipdfm License. |
| [`E_GENIX`](#constructhubspdxlicensepropertyegenix)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | eGenix.com Public License 1.1.0. |
| [`ECL_1_0`](#constructhubspdxlicensepropertyecl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Educational Community License v1.0. |
| [`ECL_2_0`](#constructhubspdxlicensepropertyecl20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Educational Community License v2.0. |
| [`ECOS_2_0`](#constructhubspdxlicensepropertyecos20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | eCos license version 2.0. |
| [`EFL_1_0`](#constructhubspdxlicensepropertyefl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Eiffel Forum License v1.0. |
| [`EFL_2_0`](#constructhubspdxlicensepropertyefl20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Eiffel Forum License v2.0. |
| [`ENTESSA`](#constructhubspdxlicensepropertyentessa)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Entessa Public License v1.0. |
| [`EPICS`](#constructhubspdxlicensepropertyepics)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | EPICS Open License. |
| [`EPL_1_0`](#constructhubspdxlicensepropertyepl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Eclipse Public License 1.0. |
| [`EPL_2_0`](#constructhubspdxlicensepropertyepl20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Eclipse Public License 2.0. |
| [`ERLPL_1_1`](#constructhubspdxlicensepropertyerlpl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Erlang Public License v1.1. |
| [`ETALAB_2_0`](#constructhubspdxlicensepropertyetalab20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Etalab Open License 2.0. |
| [`EUDATAGRID`](#constructhubspdxlicensepropertyeudatagrid)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | EU DataGrid Software License. |
| [`EUPL_1_0`](#constructhubspdxlicensepropertyeupl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | European Union Public License 1.0. |
| [`EUPL_1_1`](#constructhubspdxlicensepropertyeupl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | European Union Public License 1.1. |
| [`EUPL_1_2`](#constructhubspdxlicensepropertyeupl12)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | European Union Public License 1.2. |
| [`EUROSYM`](#constructhubspdxlicensepropertyeurosym)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Eurosym License. |
| [`FAIR`](#constructhubspdxlicensepropertyfair)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Fair License. |
| [`FRAMEWORX_1_0`](#constructhubspdxlicensepropertyframeworx10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Frameworx Open License 1.0. |
| [`FREE_IMAGE`](#constructhubspdxlicensepropertyfreeimage)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | FreeImage Public License v1.0. |
| [`FSFAP`](#constructhubspdxlicensepropertyfsfap)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | FSF All Permissive License. |
| [`FSFUL`](#constructhubspdxlicensepropertyfsful)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | FSF Unlimited License. |
| [`FSFULLR`](#constructhubspdxlicensepropertyfsfullr)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | FSF Unlimited License (with License Retention). |
| [`FTL`](#constructhubspdxlicensepropertyftl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Freetype Project License. |
| [`GFDL_1_1`](#constructhubspdxlicensepropertygfdl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.1. |
| [`GFDL_1_1_INVARIANTS_ONLY`](#constructhubspdxlicensepropertygfdl11invariantsonly)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.1 only - invariants. |
| [`GFDL_1_1_INVARIANTS_OR_LATER`](#constructhubspdxlicensepropertygfdl11invariantsorlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.1 or later - invariants. |
| [`GFDL_1_1_NO_INVARIANTS_ONLY`](#constructhubspdxlicensepropertygfdl11noinvariantsonly)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.1 only - no invariants. |
| [`GFDL_1_1_NO_INVARIANTS_OR_LATER`](#constructhubspdxlicensepropertygfdl11noinvariantsorlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.1 or later - no invariants. |
| [`GFDL_1_1_ONLY`](#constructhubspdxlicensepropertygfdl11only)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.1 only. |
| [`GFDL_1_1_OR_LATER`](#constructhubspdxlicensepropertygfdl11orlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.1 or later. |
| [`GFDL_1_2`](#constructhubspdxlicensepropertygfdl12)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.2. |
| [`GFDL_1_2_INVARIANTS_ONLY`](#constructhubspdxlicensepropertygfdl12invariantsonly)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.2 only - invariants. |
| [`GFDL_1_2_INVARIANTS_OR_LATER`](#constructhubspdxlicensepropertygfdl12invariantsorlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.2 or later - invariants. |
| [`GFDL_1_2_NO_INVARIANTS_ONLY`](#constructhubspdxlicensepropertygfdl12noinvariantsonly)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.2 only - no invariants. |
| [`GFDL_1_2_NO_INVARIANTS_OR_LATER`](#constructhubspdxlicensepropertygfdl12noinvariantsorlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.2 or later - no invariants. |
| [`GFDL_1_2_ONLY`](#constructhubspdxlicensepropertygfdl12only)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.2 only. |
| [`GFDL_1_2_OR_LATER`](#constructhubspdxlicensepropertygfdl12orlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.2 or later. |
| [`GFDL_1_3`](#constructhubspdxlicensepropertygfdl13)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.3. |
| [`GFDL_1_3_INVARIANTS_ONLY`](#constructhubspdxlicensepropertygfdl13invariantsonly)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.3 only - invariants. |
| [`GFDL_1_3_INVARIANTS_OR_LATER`](#constructhubspdxlicensepropertygfdl13invariantsorlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.3 or later - invariants. |
| [`GFDL_1_3_NO_INVARIANTS_ONLY`](#constructhubspdxlicensepropertygfdl13noinvariantsonly)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.3 only - no invariants. |
| [`GFDL_1_3_NO_INVARIANTS_OR_LATER`](#constructhubspdxlicensepropertygfdl13noinvariantsorlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.3 or later - no invariants. |
| [`GFDL_1_3_ONLY`](#constructhubspdxlicensepropertygfdl13only)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.3 only. |
| [`GFDL_1_3_OR_LATER`](#constructhubspdxlicensepropertygfdl13orlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Free Documentation License v1.3 or later. |
| [`GIFTWARE`](#constructhubspdxlicensepropertygiftware)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Giftware License. |
| [`GL2_P_S`](#constructhubspdxlicensepropertygl2ps)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GL2PS License. |
| [`GLIDE`](#constructhubspdxlicensepropertyglide)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | 3dfx Glide License. |
| [`GLULXE`](#constructhubspdxlicensepropertyglulxe)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Glulxe License. |
| [`GLWTPL`](#constructhubspdxlicensepropertyglwtpl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Good Luck With That Public License. |
| [`GNUPLOT`](#constructhubspdxlicensepropertygnuplot)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | gnuplot License. |
| [`GPL_1_0`](#constructhubspdxlicensepropertygpl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v1.0 only. |
| [`GPL_1_0_ONLY`](#constructhubspdxlicensepropertygpl10only)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v1.0 only. |
| [`GPL_1_0_OR_LATER`](#constructhubspdxlicensepropertygpl10orlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v1.0 or later. |
| [`GPL_1_0_PLUS`](#constructhubspdxlicensepropertygpl10plus)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v1.0 or later. |
| [`GPL_2_0`](#constructhubspdxlicensepropertygpl20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v2.0 only. |
| [`GPL_2_0_ONLY`](#constructhubspdxlicensepropertygpl20only)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v2.0 only. |
| [`GPL_2_0_OR_LATER`](#constructhubspdxlicensepropertygpl20orlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v2.0 or later. |
| [`GPL_2_0_PLUS`](#constructhubspdxlicensepropertygpl20plus)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v2.0 or later. |
| [`GPL_2_0_WITH_AUTOCONF_EXCEPTION`](#constructhubspdxlicensepropertygpl20withautoconfexception)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v2.0 w/Autoconf exception. |
| [`GPL_2_0_WITH_BISON_EXCEPTION`](#constructhubspdxlicensepropertygpl20withbisonexception)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v2.0 w/Bison exception. |
| [`GPL_2_0_WITH_CLASSPATH_EXCEPTION`](#constructhubspdxlicensepropertygpl20withclasspathexception)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v2.0 w/Classpath exception. |
| [`GPL_2_0_WITH_FONT_EXCEPTION`](#constructhubspdxlicensepropertygpl20withfontexception)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v2.0 w/Font exception. |
| [`GPL_2_0_WITH_GCC_EXCEPTION`](#constructhubspdxlicensepropertygpl20withgccexception)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v2.0 w/GCC Runtime Library exception. |
| [`GPL_3_0`](#constructhubspdxlicensepropertygpl30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v3.0 only. |
| [`GPL_3_0_ONLY`](#constructhubspdxlicensepropertygpl30only)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v3.0 only. |
| [`GPL_3_0_OR_LATER`](#constructhubspdxlicensepropertygpl30orlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v3.0 or later. |
| [`GPL_3_0_PLUS`](#constructhubspdxlicensepropertygpl30plus)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v3.0 or later. |
| [`GPL_3_0_WITH_AUTOCONF_EXCEPTION`](#constructhubspdxlicensepropertygpl30withautoconfexception)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v3.0 w/Autoconf exception. |
| [`GPL_3_0_WITH_GCC_EXCEPTION`](#constructhubspdxlicensepropertygpl30withgccexception)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU General Public License v3.0 w/GCC Runtime Library exception. |
| [`GSOAP_1_3B`](#constructhubspdxlicensepropertygsoap13b)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | gSOAP Public License v1.3b. |
| [`HASKELL_REPORT`](#constructhubspdxlicensepropertyhaskellreport)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Haskell Language Report License. |
| [`HIPPOCRATIC_2_1`](#constructhubspdxlicensepropertyhippocratic21)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Hippocratic License 2.1. |
| [`HPND`](#constructhubspdxlicensepropertyhpnd)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Historical Permission Notice and Disclaimer. |
| [`HPND_SELL_VARIANT`](#constructhubspdxlicensepropertyhpndsellvariant)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Historical Permission Notice and Disclaimer - sell variant. |
| [`HTMLTIDY`](#constructhubspdxlicensepropertyhtmltidy)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | HTML Tidy License. |
| [`I_MATIX`](#constructhubspdxlicensepropertyimatix)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | iMatix Standard Function Library Agreement. |
| [`IBM_PIBS`](#constructhubspdxlicensepropertyibmpibs)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | IBM PowerPC Initialization and Boot Software. |
| [`ICU`](#constructhubspdxlicensepropertyicu)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | ICU License. |
| [`IJG`](#constructhubspdxlicensepropertyijg)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Independent JPEG Group License. |
| [`IMAGE_MAGICK`](#constructhubspdxlicensepropertyimagemagick)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | ImageMagick License. |
| [`IMLIB2`](#constructhubspdxlicensepropertyimlib2)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Imlib2 License. |
| [`INFO_ZIP`](#constructhubspdxlicensepropertyinfozip)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Info-ZIP License. |
| [`INTEL`](#constructhubspdxlicensepropertyintel)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Intel Open Source License. |
| [`INTEL_ACPI`](#constructhubspdxlicensepropertyintelacpi)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Intel ACPI Software License Agreement. |
| [`INTERBASE_1_0`](#constructhubspdxlicensepropertyinterbase10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Interbase Public License v1.0. |
| [`IPA`](#constructhubspdxlicensepropertyipa)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | IPA Font License. |
| [`IPL_1_0`](#constructhubspdxlicensepropertyipl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | IBM Public License v1.0. |
| [`ISC`](#constructhubspdxlicensepropertyisc)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | ISC License. |
| [`JASPER_2_0`](#constructhubspdxlicensepropertyjasper20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | JasPer License. |
| [`JPNIC`](#constructhubspdxlicensepropertyjpnic)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Japan Network Information Center License. |
| [`JSON`](#constructhubspdxlicensepropertyjson)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | JSON License. |
| [`LAL_1_2`](#constructhubspdxlicensepropertylal12)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Licence Art Libre 1.2. |
| [`LAL_1_3`](#constructhubspdxlicensepropertylal13)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Licence Art Libre 1.3. |
| [`LATEX2_E`](#constructhubspdxlicensepropertylatex2e)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Latex2e License. |
| [`LEPTONICA`](#constructhubspdxlicensepropertyleptonica)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Leptonica License. |
| [`LGPL_2_0`](#constructhubspdxlicensepropertylgpl20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Library General Public License v2 only. |
| [`LGPL_2_0_ONLY`](#constructhubspdxlicensepropertylgpl20only)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Library General Public License v2 only. |
| [`LGPL_2_0_OR_LATER`](#constructhubspdxlicensepropertylgpl20orlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Library General Public License v2 or later. |
| [`LGPL_2_0_PLUS`](#constructhubspdxlicensepropertylgpl20plus)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Library General Public License v2 or later. |
| [`LGPL_2_1`](#constructhubspdxlicensepropertylgpl21)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Lesser General Public License v2.1 only. |
| [`LGPL_2_1_ONLY`](#constructhubspdxlicensepropertylgpl21only)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Lesser General Public License v2.1 only. |
| [`LGPL_2_1_OR_LATER`](#constructhubspdxlicensepropertylgpl21orlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Lesser General Public License v2.1 or later. |
| [`LGPL_2_1_PLUS`](#constructhubspdxlicensepropertylgpl21plus)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Library General Public License v2.1 or later. |
| [`LGPL_3_0`](#constructhubspdxlicensepropertylgpl30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Lesser General Public License v3.0 only. |
| [`LGPL_3_0_ONLY`](#constructhubspdxlicensepropertylgpl30only)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Lesser General Public License v3.0 only. |
| [`LGPL_3_0_OR_LATER`](#constructhubspdxlicensepropertylgpl30orlater)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Lesser General Public License v3.0 or later. |
| [`LGPL_3_0_PLUS`](#constructhubspdxlicensepropertylgpl30plus)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | GNU Lesser General Public License v3.0 or later. |
| [`LGPLLR`](#constructhubspdxlicensepropertylgpllr)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Lesser General Public License For Linguistic Resources. |
| [`LIBPNG`](#constructhubspdxlicensepropertylibpng)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | libpng License. |
| [`LIBPNG_2_0`](#constructhubspdxlicensepropertylibpng20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | PNG Reference Library version 2. |
| [`LIBSELINUX_1_0`](#constructhubspdxlicensepropertylibselinux10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | libselinux public domain notice. |
| [`LIBTIFF`](#constructhubspdxlicensepropertylibtiff)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | libtiff License. |
| [`LILIQ_P_1_1`](#constructhubspdxlicensepropertyliliqp11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Licence Libre du Québec – Permissive version 1.1. |
| [`LILIQ_R_1_1`](#constructhubspdxlicensepropertyliliqr11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Licence Libre du Québec – Réciprocité version 1.1. |
| [`LILIQ_RPLUS_1_1`](#constructhubspdxlicensepropertyliliqrplus11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Licence Libre du Québec – Réciprocité forte version 1.1. |
| [`LINUX_OPENIB`](#constructhubspdxlicensepropertylinuxopenib)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Linux Kernel Variant of OpenIB.org license. |
| [`LPL_1_0`](#constructhubspdxlicensepropertylpl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Lucent Public License Version 1.0. |
| [`LPL_1_02`](#constructhubspdxlicensepropertylpl102)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Lucent Public License v1.02. |
| [`LPPL_1_0`](#constructhubspdxlicensepropertylppl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | LaTeX Project Public License v1.0. |
| [`LPPL_1_1`](#constructhubspdxlicensepropertylppl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | LaTeX Project Public License v1.1. |
| [`LPPL_1_2`](#constructhubspdxlicensepropertylppl12)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | LaTeX Project Public License v1.2. |
| [`LPPL_1_3A`](#constructhubspdxlicensepropertylppl13a)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | LaTeX Project Public License v1.3a. |
| [`LPPL_1_3C`](#constructhubspdxlicensepropertylppl13c)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | LaTeX Project Public License v1.3c. |
| [`MAKE_INDEX`](#constructhubspdxlicensepropertymakeindex)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | MakeIndex License. |
| [`MIR_O_S`](#constructhubspdxlicensepropertymiros)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | The MirOS Licence. |
| [`MIT`](#constructhubspdxlicensepropertymit)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | MIT License. |
| [`MIT_0`](#constructhubspdxlicensepropertymit0)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | MIT No Attribution. |
| [`MIT_ADVERTISING`](#constructhubspdxlicensepropertymitadvertising)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Enlightenment License (e16). |
| [`MIT_CMU`](#constructhubspdxlicensepropertymitcmu)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | CMU License. |
| [`MIT_ENNA`](#constructhubspdxlicensepropertymitenna)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | enna License. |
| [`MIT_FEH`](#constructhubspdxlicensepropertymitfeh)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | feh License. |
| [`MIT_OPEN_GROUP`](#constructhubspdxlicensepropertymitopengroup)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | MIT Open Group variant. |
| [`MITNFA`](#constructhubspdxlicensepropertymitnfa)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | MIT +no-false-attribs license. |
| [`MOTOSOTO`](#constructhubspdxlicensepropertymotosoto)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Motosoto License. |
| [`MPICH2`](#constructhubspdxlicensepropertympich2)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | mpich2 License. |
| [`MPL_1_0`](#constructhubspdxlicensepropertympl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Mozilla Public License 1.0. |
| [`MPL_1_1`](#constructhubspdxlicensepropertympl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Mozilla Public License 1.1. |
| [`MPL_2_0`](#constructhubspdxlicensepropertympl20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Mozilla Public License 2.0. |
| [`MPL_2_0_NO_COPYLEFT_EXCEPTION`](#constructhubspdxlicensepropertympl20nocopyleftexception)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Mozilla Public License 2.0 (no copyleft exception). |
| [`MS_PL`](#constructhubspdxlicensepropertymspl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Microsoft Public License. |
| [`MS_RL`](#constructhubspdxlicensepropertymsrl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Microsoft Reciprocal License. |
| [`MTLL`](#constructhubspdxlicensepropertymtll)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Matrix Template Library License. |
| [`MULANPSL_1_0`](#constructhubspdxlicensepropertymulanpsl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Mulan Permissive Software License, Version 1. |
| [`MULANPSL_2_0`](#constructhubspdxlicensepropertymulanpsl20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Mulan Permissive Software License, Version 2. |
| [`MULTICS`](#constructhubspdxlicensepropertymultics)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Multics License. |
| [`MUP`](#constructhubspdxlicensepropertymup)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Mup License. |
| [`NASA_1_3`](#constructhubspdxlicensepropertynasa13)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | NASA Open Source Agreement 1.3. |
| [`NAUMEN`](#constructhubspdxlicensepropertynaumen)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Naumen Public License. |
| [`NBPL_1_0`](#constructhubspdxlicensepropertynbpl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Net Boolean Public License v1. |
| [`NCGL_UK_2_0`](#constructhubspdxlicensepropertyncgluk20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Non-Commercial Government Licence. |
| [`NCSA`](#constructhubspdxlicensepropertyncsa)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | University of Illinois/NCSA Open Source License. |
| [`NET_CD_F`](#constructhubspdxlicensepropertynetcdf)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | NetCDF license. |
| [`NET_SNMP`](#constructhubspdxlicensepropertynetsnmp)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Net-SNMP License. |
| [`NEWSLETR`](#constructhubspdxlicensepropertynewsletr)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Newsletr License. |
| [`NGPL`](#constructhubspdxlicensepropertyngpl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Nethack General Public License. |
| [`NIST_PD`](#constructhubspdxlicensepropertynistpd)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | NIST Public Domain Notice. |
| [`NIST_PD_FALLBACK`](#constructhubspdxlicensepropertynistpdfallback)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | NIST Public Domain Notice with license fallback. |
| [`NLOD_1_0`](#constructhubspdxlicensepropertynlod10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Norwegian Licence for Open Government Data. |
| [`NLPL`](#constructhubspdxlicensepropertynlpl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | No Limit Public License. |
| [`NOKIA`](#constructhubspdxlicensepropertynokia)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Nokia Open Source License. |
| [`NOSL`](#constructhubspdxlicensepropertynosl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Netizen Open Source License. |
| [`NOWEB`](#constructhubspdxlicensepropertynoweb)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Noweb License. |
| [`NPL_1_0`](#constructhubspdxlicensepropertynpl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Netscape Public License v1.0. |
| [`NPL_1_1`](#constructhubspdxlicensepropertynpl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Netscape Public License v1.1. |
| [`NPOSL_3_0`](#constructhubspdxlicensepropertynposl30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Non-Profit Open Software License 3.0. |
| [`NRL`](#constructhubspdxlicensepropertynrl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | NRL License. |
| [`NTP`](#constructhubspdxlicensepropertyntp)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | NTP License. |
| [`NTP_0`](#constructhubspdxlicensepropertyntp0)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | NTP No Attribution. |
| [`NUNIT`](#constructhubspdxlicensepropertynunit)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Nunit License. |
| [`O_UDA_1_0`](#constructhubspdxlicensepropertyouda10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Use of Data Agreement v1.0. |
| [`OCCT_PL`](#constructhubspdxlicensepropertyocctpl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open CASCADE Technology Public License. |
| [`OCLC_2_0`](#constructhubspdxlicensepropertyoclc20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | OCLC Research Public License 2.0. |
| [`ODBL_1_0`](#constructhubspdxlicensepropertyodbl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | ODC Open Database License v1.0. |
| [`ODC_BY_1_0`](#constructhubspdxlicensepropertyodcby10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Data Commons Attribution License v1.0. |
| [`OFL_1_0`](#constructhubspdxlicensepropertyofl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SIL Open Font License 1.0. |
| [`OFL_1_0_NO_RFN`](#constructhubspdxlicensepropertyofl10norfn)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SIL Open Font License 1.0 with no Reserved Font Name. |
| [`OFL_1_0_RFN`](#constructhubspdxlicensepropertyofl10rfn)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SIL Open Font License 1.0 with Reserved Font Name. |
| [`OFL_1_1`](#constructhubspdxlicensepropertyofl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SIL Open Font License 1.1. |
| [`OFL_1_1_NO_RFN`](#constructhubspdxlicensepropertyofl11norfn)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SIL Open Font License 1.1 with no Reserved Font Name. |
| [`OFL_1_1_RFN`](#constructhubspdxlicensepropertyofl11rfn)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SIL Open Font License 1.1 with Reserved Font Name. |
| [`OGC_1_0`](#constructhubspdxlicensepropertyogc10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | OGC Software License, Version 1.0. |
| [`OGL_CANADA_2_0`](#constructhubspdxlicensepropertyoglcanada20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Government Licence - Canada. |
| [`OGL_UK_1_0`](#constructhubspdxlicensepropertyogluk10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Government Licence v1.0. |
| [`OGL_UK_2_0`](#constructhubspdxlicensepropertyogluk20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Government Licence v2.0. |
| [`OGL_UK_3_0`](#constructhubspdxlicensepropertyogluk30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Government Licence v3.0. |
| [`OGTSL`](#constructhubspdxlicensepropertyogtsl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Group Test Suite License. |
| [`OLDAP_1_1`](#constructhubspdxlicensepropertyoldap11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v1.1. |
| [`OLDAP_1_2`](#constructhubspdxlicensepropertyoldap12)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v1.2. |
| [`OLDAP_1_3`](#constructhubspdxlicensepropertyoldap13)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v1.3. |
| [`OLDAP_1_4`](#constructhubspdxlicensepropertyoldap14)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v1.4. |
| [`OLDAP_2_0`](#constructhubspdxlicensepropertyoldap20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v2.0 (or possibly 2.0A and 2.0B). |
| [`OLDAP_2_0_1`](#constructhubspdxlicensepropertyoldap201)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v2.0.1. |
| [`OLDAP_2_1`](#constructhubspdxlicensepropertyoldap21)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v2.1. |
| [`OLDAP_2_2`](#constructhubspdxlicensepropertyoldap22)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v2.2. |
| [`OLDAP_2_2_1`](#constructhubspdxlicensepropertyoldap221)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v2.2.1. |
| [`OLDAP_2_2_2`](#constructhubspdxlicensepropertyoldap222)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License 2.2.2. |
| [`OLDAP_2_3`](#constructhubspdxlicensepropertyoldap23)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v2.3. |
| [`OLDAP_2_4`](#constructhubspdxlicensepropertyoldap24)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v2.4. |
| [`OLDAP_2_5`](#constructhubspdxlicensepropertyoldap25)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v2.5. |
| [`OLDAP_2_6`](#constructhubspdxlicensepropertyoldap26)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v2.6. |
| [`OLDAP_2_7`](#constructhubspdxlicensepropertyoldap27)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v2.7. |
| [`OLDAP_2_8`](#constructhubspdxlicensepropertyoldap28)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open LDAP Public License v2.8. |
| [`OML`](#constructhubspdxlicensepropertyoml)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Market License. |
| [`OPEN_SS_L`](#constructhubspdxlicensepropertyopenssl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | OpenSSL License. |
| [`OPL_1_0`](#constructhubspdxlicensepropertyopl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Public License v1.0. |
| [`OSET_PL_2_1`](#constructhubspdxlicensepropertyosetpl21)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | OSET Public License version 2.1. |
| [`OSL_1_0`](#constructhubspdxlicensepropertyosl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Software License 1.0. |
| [`OSL_1_1`](#constructhubspdxlicensepropertyosl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Software License 1.1. |
| [`OSL_2_0`](#constructhubspdxlicensepropertyosl20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Software License 2.0. |
| [`OSL_2_1`](#constructhubspdxlicensepropertyosl21)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Software License 2.1. |
| [`OSL_3_0`](#constructhubspdxlicensepropertyosl30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Open Software License 3.0. |
| [`PARITY_6_0_0`](#constructhubspdxlicensepropertyparity600)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | The Parity Public License 6.0.0. |
| [`PARITY_7_0_0`](#constructhubspdxlicensepropertyparity700)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | The Parity Public License 7.0.0. |
| [`PDDL_1_0`](#constructhubspdxlicensepropertypddl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | ODC Public Domain Dedication & License 1.0. |
| [`PHP_3_0`](#constructhubspdxlicensepropertyphp30)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | PHP License v3.0. |
| [`PHP_3_01`](#constructhubspdxlicensepropertyphp301)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | PHP License v3.01. |
| [`PLEXUS`](#constructhubspdxlicensepropertyplexus)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Plexus Classworlds License. |
| [`POLYFORM_NONCOMMERCIAL_1_0_0`](#constructhubspdxlicensepropertypolyformnoncommercial100)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | PolyForm Noncommercial License 1.0.0. |
| [`POLYFORM_SMALL_BUSINESS_1_0_0`](#constructhubspdxlicensepropertypolyformsmallbusiness100)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | PolyForm Small Business License 1.0.0. |
| [`POSTGRE_SQ_L`](#constructhubspdxlicensepropertypostgresql)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | PostgreSQL License. |
| [`PSF_2_0`](#constructhubspdxlicensepropertypsf20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Python Software Foundation License 2.0. |
| [`PSFRAG`](#constructhubspdxlicensepropertypsfrag)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | psfrag License. |
| [`PSUTILS`](#constructhubspdxlicensepropertypsutils)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | psutils License. |
| [`PYTHON_2_0`](#constructhubspdxlicensepropertypython20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Python License 2.0. |
| [`QHULL`](#constructhubspdxlicensepropertyqhull)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Qhull License. |
| [`QPL_1_0`](#constructhubspdxlicensepropertyqpl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Q Public License 1.0. |
| [`RDISC`](#constructhubspdxlicensepropertyrdisc)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Rdisc License. |
| [`RHECOS_1_1`](#constructhubspdxlicensepropertyrhecos11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Red Hat eCos Public License v1.1. |
| [`RPL_1_1`](#constructhubspdxlicensepropertyrpl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Reciprocal Public License 1.1. |
| [`RPL_1_5`](#constructhubspdxlicensepropertyrpl15)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Reciprocal Public License 1.5. |
| [`RPSL_1_0`](#constructhubspdxlicensepropertyrpsl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | RealNetworks Public Source License v1.0. |
| [`RSA_MD`](#constructhubspdxlicensepropertyrsamd)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | RSA Message-Digest License. |
| [`RSCPL`](#constructhubspdxlicensepropertyrscpl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Ricoh Source Code Public License. |
| [`RUBY`](#constructhubspdxlicensepropertyruby)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Ruby License. |
| [`SAX_PD`](#constructhubspdxlicensepropertysaxpd)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Sax Public Domain Notice. |
| [`SAXPATH`](#constructhubspdxlicensepropertysaxpath)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Saxpath License. |
| [`SCEA`](#constructhubspdxlicensepropertyscea)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SCEA Shared Source License. |
| [`SENDMAIL`](#constructhubspdxlicensepropertysendmail)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Sendmail License. |
| [`SENDMAIL_8_23`](#constructhubspdxlicensepropertysendmail823)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Sendmail License 8.23. |
| [`SGI_B_1_0`](#constructhubspdxlicensepropertysgib10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SGI Free Software License B v1.0. |
| [`SGI_B_1_1`](#constructhubspdxlicensepropertysgib11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SGI Free Software License B v1.1. |
| [`SGI_B_2_0`](#constructhubspdxlicensepropertysgib20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SGI Free Software License B v2.0. |
| [`SHL_0_5`](#constructhubspdxlicensepropertyshl05)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Solderpad Hardware License v0.5. |
| [`SHL_0_51`](#constructhubspdxlicensepropertyshl051)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Solderpad Hardware License, Version 0.51. |
| [`SIMPL_2_0`](#constructhubspdxlicensepropertysimpl20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Simple Public License 2.0. |
| [`SISSL`](#constructhubspdxlicensepropertysissl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Sun Industry Standards Source License v1.1. |
| [`SISSL_1_2`](#constructhubspdxlicensepropertysissl12)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Sun Industry Standards Source License v1.2. |
| [`SLEEPYCAT`](#constructhubspdxlicensepropertysleepycat)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Sleepycat License. |
| [`SMLNJ`](#constructhubspdxlicensepropertysmlnj)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Standard ML of New Jersey License. |
| [`SMPPL`](#constructhubspdxlicensepropertysmppl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Secure Messaging Protocol Public License. |
| [`SNIA`](#constructhubspdxlicensepropertysnia)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SNIA Public License 1.1. |
| [`SPENCER_86`](#constructhubspdxlicensepropertyspencer86)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Spencer License 86. |
| [`SPENCER_94`](#constructhubspdxlicensepropertyspencer94)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Spencer License 94. |
| [`SPENCER_99`](#constructhubspdxlicensepropertyspencer99)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Spencer License 99. |
| [`SPL_1_0`](#constructhubspdxlicensepropertyspl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Sun Public License v1.0. |
| [`SSH_OPENSSH`](#constructhubspdxlicensepropertysshopenssh)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SSH OpenSSH license. |
| [`SSH_SHORT`](#constructhubspdxlicensepropertysshshort)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SSH short notice. |
| [`SSPL_1_0`](#constructhubspdxlicensepropertysspl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Server Side Public License, v 1. |
| [`STANDARDML_NJ`](#constructhubspdxlicensepropertystandardmlnj)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Standard ML of New Jersey License. |
| [`SUGARCRM_1_1_3`](#constructhubspdxlicensepropertysugarcrm113)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | SugarCRM Public License v1.1.3. |
| [`SWL`](#constructhubspdxlicensepropertyswl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Scheme Widget Library (SWL) Software License Agreement. |
| [`TAPR_OHL_1_0`](#constructhubspdxlicensepropertytaprohl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | TAPR Open Hardware License v1.0. |
| [`TCL`](#constructhubspdxlicensepropertytcl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | TCL/TK License. |
| [`TCP_WRAPPERS`](#constructhubspdxlicensepropertytcpwrappers)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | TCP Wrappers License. |
| [`TMATE`](#constructhubspdxlicensepropertytmate)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | TMate Open Source License. |
| [`TORQUE_1_1`](#constructhubspdxlicensepropertytorque11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | TORQUE v2.5+ Software License v1.1. |
| [`TOSL`](#constructhubspdxlicensepropertytosl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Trusster Open Source License. |
| [`TU_BERLIN_1_0`](#constructhubspdxlicensepropertytuberlin10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Technische Universitaet Berlin License 1.0. |
| [`TU_BERLIN_2_0`](#constructhubspdxlicensepropertytuberlin20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Technische Universitaet Berlin License 2.0. |
| [`UCL_1_0`](#constructhubspdxlicensepropertyucl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Upstream Compatibility License v1.0. |
| [`UNICODE_DFS_2015`](#constructhubspdxlicensepropertyunicodedfs2015)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Unicode License Agreement - Data Files and Software (2015). |
| [`UNICODE_DFS_2016`](#constructhubspdxlicensepropertyunicodedfs2016)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Unicode License Agreement - Data Files and Software (2016). |
| [`UNICODE_TOU`](#constructhubspdxlicensepropertyunicodetou)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Unicode Terms of Use. |
| [`UNLICENSE`](#constructhubspdxlicensepropertyunlicense)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | The Unlicense. |
| [`UNLICENSED`](#constructhubspdxlicensepropertyunlicensed)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Packages that have not been licensed. |
| [`UPL_1_0`](#constructhubspdxlicensepropertyupl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Universal Permissive License v1.0. |
| [`VIM`](#constructhubspdxlicensepropertyvim)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Vim License. |
| [`VOSTROM`](#constructhubspdxlicensepropertyvostrom)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | VOSTROM Public License for Open Source. |
| [`VSL_1_0`](#constructhubspdxlicensepropertyvsl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Vovida Software License v1.0. |
| [`W3_C`](#constructhubspdxlicensepropertyw3c)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | W3C Software Notice and License (2002-12-31). |
| [`W3C_19980720`](#constructhubspdxlicensepropertyw3c19980720)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | W3C Software Notice and License (1998-07-20). |
| [`W3C_20150513`](#constructhubspdxlicensepropertyw3c20150513)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | W3C Software Notice and Document License (2015-05-13). |
| [`WATCOM_1_0`](#constructhubspdxlicensepropertywatcom10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Sybase Open Watcom Public License 1.0. |
| [`WSUIPA`](#constructhubspdxlicensepropertywsuipa)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Wsuipa License. |
| [`WTFPL`](#constructhubspdxlicensepropertywtfpl)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Do What The F*ck You Want To Public License. |
| [`WX_WINDOWS`](#constructhubspdxlicensepropertywxwindows)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | wxWindows Library License. |
| [`X11`](#constructhubspdxlicensepropertyx11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | X11 License. |
| [`XEROX`](#constructhubspdxlicensepropertyxerox)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Xerox License. |
| [`XFREE86_1_1`](#constructhubspdxlicensepropertyxfree8611)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | XFree86 License 1.1. |
| [`XINETD`](#constructhubspdxlicensepropertyxinetd)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | xinetd License. |
| [`XNET`](#constructhubspdxlicensepropertyxnet)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | X.Net License. |
| [`XPP`](#constructhubspdxlicensepropertyxpp)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | XPP License. |
| [`XSKAT`](#constructhubspdxlicensepropertyxskat)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | XSkat License. |
| [`YPL_1_0`](#constructhubspdxlicensepropertyypl10)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Yahoo! |
| [`YPL_1_1`](#constructhubspdxlicensepropertyypl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Yahoo! |
| [`ZED`](#constructhubspdxlicensepropertyzed)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Zed License. |
| [`ZEND_2_0`](#constructhubspdxlicensepropertyzend20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Zend License v2.0. |
| [`ZERO_BSD`](#constructhubspdxlicensepropertyzerobsd)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | BSD Zero Clause License. |
| [`ZIMBRA_1_3`](#constructhubspdxlicensepropertyzimbra13)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Zimbra Public License v1.3. |
| [`ZIMBRA_1_4`](#constructhubspdxlicensepropertyzimbra14)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Zimbra Public License v1.4. |
| [`ZLIB`](#constructhubspdxlicensepropertyzlib)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | zlib License. |
| [`ZLIB_ACKNOWLEDGEMENT`](#constructhubspdxlicensepropertyzlibacknowledgement)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | zlib/libpng License with Acknowledgement. |
| [`ZPL_1_1`](#constructhubspdxlicensepropertyzpl11)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Zope Public License 1.1. |
| [`ZPL_2_0`](#constructhubspdxlicensepropertyzpl20)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Zope Public License 2.0. |
| [`ZPL_2_1`](#constructhubspdxlicensepropertyzpl21)<span title="Required">*</span> | [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense) | Zope Public License 2.1. |

---

##### `AAL` <a name="construct-hub.SpdxLicense.property.AAL" id="constructhubspdxlicensepropertyaal"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Attribution Assurance License.

> https://opensource.org/licenses/attribution

---

##### `ABSTYLES` <a name="construct-hub.SpdxLicense.property.ABSTYLES" id="constructhubspdxlicensepropertyabstyles"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Abstyles License.

> https://fedoraproject.org/wiki/Licensing/Abstyles

---

##### `ADOBE_2006` <a name="construct-hub.SpdxLicense.property.ADOBE_2006" id="constructhubspdxlicensepropertyadobe2006"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Adobe Systems Incorporated Source Code License Agreement.

> https://fedoraproject.org/wiki/Licensing/AdobeLicense

---

##### `ADOBE_GLYPH` <a name="construct-hub.SpdxLicense.property.ADOBE_GLYPH" id="constructhubspdxlicensepropertyadobeglyph"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Adobe Glyph List License.

> https://fedoraproject.org/wiki/Licensing/MIT#AdobeGlyph

---

##### `ADSL` <a name="construct-hub.SpdxLicense.property.ADSL" id="constructhubspdxlicensepropertyadsl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Amazon Digital Services License.

> https://fedoraproject.org/wiki/Licensing/AmazonDigitalServicesLicense

---

##### `AFL_1_1` <a name="construct-hub.SpdxLicense.property.AFL_1_1" id="constructhubspdxlicensepropertyafl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Academic Free License v1.1.

> http://opensource.linux-mirror.org/licenses/afl-1.1.txt

---

##### `AFL_1_2` <a name="construct-hub.SpdxLicense.property.AFL_1_2" id="constructhubspdxlicensepropertyafl12"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Academic Free License v1.2.

> http://opensource.linux-mirror.org/licenses/afl-1.2.txt

---

##### `AFL_2_0` <a name="construct-hub.SpdxLicense.property.AFL_2_0" id="constructhubspdxlicensepropertyafl20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Academic Free License v2.0.

> http://wayback.archive.org/web/20060924134533/http://www.opensource.org/licenses/afl-2.0.txt

---

##### `AFL_2_1` <a name="construct-hub.SpdxLicense.property.AFL_2_1" id="constructhubspdxlicensepropertyafl21"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Academic Free License v2.1.

> http://opensource.linux-mirror.org/licenses/afl-2.1.txt

---

##### `AFL_3_0` <a name="construct-hub.SpdxLicense.property.AFL_3_0" id="constructhubspdxlicensepropertyafl30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Academic Free License v3.0.

> http://www.rosenlaw.com/AFL3.0.htm

---

##### `AFMPARSE` <a name="construct-hub.SpdxLicense.property.AFMPARSE" id="constructhubspdxlicensepropertyafmparse"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Afmparse License.

> https://fedoraproject.org/wiki/Licensing/Afmparse

---

##### `AGPL_1_0` <a name="construct-hub.SpdxLicense.property.AGPL_1_0" id="constructhubspdxlicensepropertyagpl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Affero General Public License v1.0.

> http://www.affero.org/oagpl.html

---

##### `AGPL_1_0_ONLY` <a name="construct-hub.SpdxLicense.property.AGPL_1_0_ONLY" id="constructhubspdxlicensepropertyagpl10only"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Affero General Public License v1.0 only.

> http://www.affero.org/oagpl.html

---

##### `AGPL_1_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.AGPL_1_0_OR_LATER" id="constructhubspdxlicensepropertyagpl10orlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Affero General Public License v1.0 or later.

> http://www.affero.org/oagpl.html

---

##### `AGPL_3_0` <a name="construct-hub.SpdxLicense.property.AGPL_3_0" id="constructhubspdxlicensepropertyagpl30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Affero General Public License v3.0.

> https://www.gnu.org/licenses/agpl.txt

---

##### `AGPL_3_0_ONLY` <a name="construct-hub.SpdxLicense.property.AGPL_3_0_ONLY" id="constructhubspdxlicensepropertyagpl30only"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Affero General Public License v3.0 only.

> https://www.gnu.org/licenses/agpl.txt

---

##### `AGPL_3_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.AGPL_3_0_OR_LATER" id="constructhubspdxlicensepropertyagpl30orlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Affero General Public License v3.0 or later.

> https://www.gnu.org/licenses/agpl.txt

---

##### `ALADDIN` <a name="construct-hub.SpdxLicense.property.ALADDIN" id="constructhubspdxlicensepropertyaladdin"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Aladdin Free Public License.

> http://pages.cs.wisc.edu/~ghost/doc/AFPL/6.01/Public.htm

---

##### `AMDPLPA` <a name="construct-hub.SpdxLicense.property.AMDPLPA" id="constructhubspdxlicensepropertyamdplpa"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

AMD's plpa_map.c License.

> https://fedoraproject.org/wiki/Licensing/AMD_plpa_map_License

---

##### `AML` <a name="construct-hub.SpdxLicense.property.AML" id="constructhubspdxlicensepropertyaml"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apple MIT License.

> https://fedoraproject.org/wiki/Licensing/Apple_MIT_License

---

##### `AMPAS` <a name="construct-hub.SpdxLicense.property.AMPAS" id="constructhubspdxlicensepropertyampas"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Academy of Motion Picture Arts and Sciences BSD.

> https://fedoraproject.org/wiki/Licensing/BSD#AMPASBSD

---

##### `ANTLR_PD` <a name="construct-hub.SpdxLicense.property.ANTLR_PD" id="constructhubspdxlicensepropertyantlrpd"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ANTLR Software Rights Notice.

> http://www.antlr2.org/license.html

---

##### `ANTLR_PD_FALLBACK` <a name="construct-hub.SpdxLicense.property.ANTLR_PD_FALLBACK" id="constructhubspdxlicensepropertyantlrpdfallback"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ANTLR Software Rights Notice with license fallback.

> http://www.antlr2.org/license.html

---

##### `APACHE_1_0` <a name="construct-hub.SpdxLicense.property.APACHE_1_0" id="constructhubspdxlicensepropertyapache10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apache License 1.0.

> http://www.apache.org/licenses/LICENSE-1.0

---

##### `APACHE_1_1` <a name="construct-hub.SpdxLicense.property.APACHE_1_1" id="constructhubspdxlicensepropertyapache11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apache License 1.1.

> http://apache.org/licenses/LICENSE-1.1

---

##### `APACHE_2_0` <a name="construct-hub.SpdxLicense.property.APACHE_2_0" id="constructhubspdxlicensepropertyapache20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apache License 2.0.

> http://www.apache.org/licenses/LICENSE-2.0

---

##### `APAFML` <a name="construct-hub.SpdxLicense.property.APAFML" id="constructhubspdxlicensepropertyapafml"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Adobe Postscript AFM License.

> https://fedoraproject.org/wiki/Licensing/AdobePostscriptAFM

---

##### `APL_1_0` <a name="construct-hub.SpdxLicense.property.APL_1_0" id="constructhubspdxlicensepropertyapl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Adaptive Public License 1.0.

> https://opensource.org/licenses/APL-1.0

---

##### `APSL_1_0` <a name="construct-hub.SpdxLicense.property.APSL_1_0" id="constructhubspdxlicensepropertyapsl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apple Public Source License 1.0.

> https://fedoraproject.org/wiki/Licensing/Apple_Public_Source_License_1.0

---

##### `APSL_1_1` <a name="construct-hub.SpdxLicense.property.APSL_1_1" id="constructhubspdxlicensepropertyapsl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apple Public Source License 1.1.

> http://www.opensource.apple.com/source/IOSerialFamily/IOSerialFamily-7/APPLE_LICENSE

---

##### `APSL_1_2` <a name="construct-hub.SpdxLicense.property.APSL_1_2" id="constructhubspdxlicensepropertyapsl12"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apple Public Source License 1.2.

> http://www.samurajdata.se/opensource/mirror/licenses/apsl.php

---

##### `APSL_2_0` <a name="construct-hub.SpdxLicense.property.APSL_2_0" id="constructhubspdxlicensepropertyapsl20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Apple Public Source License 2.0.

> http://www.opensource.apple.com/license/apsl/

---

##### `ARTISTIC_1_0` <a name="construct-hub.SpdxLicense.property.ARTISTIC_1_0" id="constructhubspdxlicensepropertyartistic10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Artistic License 1.0.

> https://opensource.org/licenses/Artistic-1.0

---

##### `ARTISTIC_1_0_CL8` <a name="construct-hub.SpdxLicense.property.ARTISTIC_1_0_CL8" id="constructhubspdxlicensepropertyartistic10cl8"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Artistic License 1.0 w/clause 8.

> https://opensource.org/licenses/Artistic-1.0

---

##### `ARTISTIC_1_0_PERL` <a name="construct-hub.SpdxLicense.property.ARTISTIC_1_0_PERL" id="constructhubspdxlicensepropertyartistic10perl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Artistic License 1.0 (Perl).

> http://dev.perl.org/licenses/artistic.html

---

##### `ARTISTIC_2_0` <a name="construct-hub.SpdxLicense.property.ARTISTIC_2_0" id="constructhubspdxlicensepropertyartistic20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Artistic License 2.0.

> http://www.perlfoundation.org/artistic_license_2_0

---

##### `BAHYPH` <a name="construct-hub.SpdxLicense.property.BAHYPH" id="constructhubspdxlicensepropertybahyph"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Bahyph License.

> https://fedoraproject.org/wiki/Licensing/Bahyph

---

##### `BARR` <a name="construct-hub.SpdxLicense.property.BARR" id="constructhubspdxlicensepropertybarr"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Barr License.

> https://fedoraproject.org/wiki/Licensing/Barr

---

##### `BEERWARE` <a name="construct-hub.SpdxLicense.property.BEERWARE" id="constructhubspdxlicensepropertybeerware"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Beerware License.

> https://fedoraproject.org/wiki/Licensing/Beerware

---

##### `BITTORRENT_1_0` <a name="construct-hub.SpdxLicense.property.BITTORRENT_1_0" id="constructhubspdxlicensepropertybittorrent10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BitTorrent Open Source License v1.0.

> http://sources.gentoo.org/cgi-bin/viewvc.cgi/gentoo-x86/licenses/BitTorrent?r1=1.1&r2=1.1.1.1&diff_format=s

---

##### `BITTORRENT_1_1` <a name="construct-hub.SpdxLicense.property.BITTORRENT_1_1" id="constructhubspdxlicensepropertybittorrent11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BitTorrent Open Source License v1.1.

> http://directory.fsf.org/wiki/License:BitTorrentOSL1.1

---

##### `BLESSING` <a name="construct-hub.SpdxLicense.property.BLESSING" id="constructhubspdxlicensepropertyblessing"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SQLite Blessing.

> https://www.sqlite.org/src/artifact/e33a4df7e32d742a?ln=4-9

---

##### `BLUEOAK_1_0_0` <a name="construct-hub.SpdxLicense.property.BLUEOAK_1_0_0" id="constructhubspdxlicensepropertyblueoak100"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Blue Oak Model License 1.0.0.

> https://blueoakcouncil.org/license/1.0.0

---

##### `BORCEUX` <a name="construct-hub.SpdxLicense.property.BORCEUX" id="constructhubspdxlicensepropertyborceux"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Borceux license.

> https://fedoraproject.org/wiki/Licensing/Borceux

---

##### `BSD_1_CLAUSE` <a name="construct-hub.SpdxLicense.property.BSD_1_CLAUSE" id="constructhubspdxlicensepropertybsd1clause"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 1-Clause License.

> https://svnweb.freebsd.org/base/head/include/ifaddrs.h?revision=326823

---

##### `BSD_2_CLAUSE` <a name="construct-hub.SpdxLicense.property.BSD_2_CLAUSE" id="constructhubspdxlicensepropertybsd2clause"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 2-Clause "Simplified" License.

> https://opensource.org/licenses/BSD-2-Clause

---

##### `BSD_2_CLAUSE_FREEBSD` <a name="construct-hub.SpdxLicense.property.BSD_2_CLAUSE_FREEBSD" id="constructhubspdxlicensepropertybsd2clausefreebsd"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 2-Clause FreeBSD License.

> http://www.freebsd.org/copyright/freebsd-license.html

---

##### `BSD_2_CLAUSE_NETBSD` <a name="construct-hub.SpdxLicense.property.BSD_2_CLAUSE_NETBSD" id="constructhubspdxlicensepropertybsd2clausenetbsd"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 2-Clause NetBSD License.

> http://www.netbsd.org/about/redistribution.html#default

---

##### `BSD_2_CLAUSE_PATENT` <a name="construct-hub.SpdxLicense.property.BSD_2_CLAUSE_PATENT" id="constructhubspdxlicensepropertybsd2clausepatent"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD-2-Clause Plus Patent License.

> https://opensource.org/licenses/BSDplusPatent

---

##### `BSD_2_CLAUSE_VIEWS` <a name="construct-hub.SpdxLicense.property.BSD_2_CLAUSE_VIEWS" id="constructhubspdxlicensepropertybsd2clauseviews"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 2-Clause with views sentence.

> http://www.freebsd.org/copyright/freebsd-license.html

---

##### `BSD_3_CLAUSE` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE" id="constructhubspdxlicensepropertybsd3clause"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 3-Clause "New" or "Revised" License.

> https://opensource.org/licenses/BSD-3-Clause

---

##### `BSD_3_CLAUSE_ATTRIBUTION` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_ATTRIBUTION" id="constructhubspdxlicensepropertybsd3clauseattribution"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD with attribution.

> https://fedoraproject.org/wiki/Licensing/BSD_with_Attribution

---

##### `BSD_3_CLAUSE_CLEAR` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_CLEAR" id="constructhubspdxlicensepropertybsd3clauseclear"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 3-Clause Clear License.

> http://labs.metacarta.com/license-explanation.html#license

---

##### `BSD_3_CLAUSE_LBNL` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_LBNL" id="constructhubspdxlicensepropertybsd3clauselbnl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Lawrence Berkeley National Labs BSD variant license.

> https://fedoraproject.org/wiki/Licensing/LBNLBSD

---

##### `BSD_3_CLAUSE_NO_NUCLEAR_LICENSE` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_NO_NUCLEAR_LICENSE" id="constructhubspdxlicensepropertybsd3clausenonuclearlicense"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 3-Clause No Nuclear License.

> http://download.oracle.com/otn-pub/java/licenses/bsd.txt?AuthParam=1467140197_43d516ce1776bd08a58235a7785be1cc

---

##### `BSD_3_CLAUSE_NO_NUCLEAR_LICENSE_2014` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_NO_NUCLEAR_LICENSE_2014" id="constructhubspdxlicensepropertybsd3clausenonuclearlicense2014"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 3-Clause No Nuclear License 2014.

> https://java.net/projects/javaeetutorial/pages/BerkeleyLicense

---

##### `BSD_3_CLAUSE_NO_NUCLEAR_WARRANTY` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_NO_NUCLEAR_WARRANTY" id="constructhubspdxlicensepropertybsd3clausenonuclearwarranty"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 3-Clause No Nuclear Warranty.

> https://jogamp.org/git/?p=gluegen.git;a=blob_plain;f=LICENSE.txt

---

##### `BSD_3_CLAUSE_OPEN_MPI` <a name="construct-hub.SpdxLicense.property.BSD_3_CLAUSE_OPEN_MPI" id="constructhubspdxlicensepropertybsd3clauseopenmpi"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 3-Clause Open MPI variant.

> https://www.open-mpi.org/community/license.php

---

##### `BSD_4_CLAUSE` <a name="construct-hub.SpdxLicense.property.BSD_4_CLAUSE" id="constructhubspdxlicensepropertybsd4clause"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD 4-Clause "Original" or "Old" License.

> http://directory.fsf.org/wiki/License:BSD_4Clause

---

##### `BSD_4_CLAUSE_UC` <a name="construct-hub.SpdxLicense.property.BSD_4_CLAUSE_UC" id="constructhubspdxlicensepropertybsd4clauseuc"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD-4-Clause (University of California-Specific).

> http://www.freebsd.org/copyright/license.html

---

##### `BSD_PROTECTION` <a name="construct-hub.SpdxLicense.property.BSD_PROTECTION" id="constructhubspdxlicensepropertybsdprotection"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD Protection License.

> https://fedoraproject.org/wiki/Licensing/BSD_Protection_License

---

##### `BSD_SOURCE_CODE` <a name="construct-hub.SpdxLicense.property.BSD_SOURCE_CODE" id="constructhubspdxlicensepropertybsdsourcecode"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD Source Code Attribution.

> https://github.com/robbiehanson/CocoaHTTPServer/blob/master/LICENSE.txt

---

##### `BSL_1_0` <a name="construct-hub.SpdxLicense.property.BSL_1_0" id="constructhubspdxlicensepropertybsl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Boost Software License 1.0.

> http://www.boost.org/LICENSE_1_0.txt

---

##### `BUSL_1_1` <a name="construct-hub.SpdxLicense.property.BUSL_1_1" id="constructhubspdxlicensepropertybusl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Business Source License 1.1.

> https://mariadb.com/bsl11/

---

##### `BZIP2_1_0_5` <a name="construct-hub.SpdxLicense.property.BZIP2_1_0_5" id="constructhubspdxlicensepropertybzip2105"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

bzip2 and libbzip2 License v1.0.5.

> https://sourceware.org/bzip2/1.0.5/bzip2-manual-1.0.5.html

---

##### `BZIP2_1_0_6` <a name="construct-hub.SpdxLicense.property.BZIP2_1_0_6" id="constructhubspdxlicensepropertybzip2106"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

bzip2 and libbzip2 License v1.0.6.

> https://sourceware.org/git/?p=bzip2.git;a=blob;f=LICENSE;hb=bzip2-1.0.6

---

##### `CAL_1_0` <a name="construct-hub.SpdxLicense.property.CAL_1_0" id="constructhubspdxlicensepropertycal10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Cryptographic Autonomy License 1.0.

> http://cryptographicautonomylicense.com/license-text.html

---

##### `CAL_1_0_COMBINED_WORK_EXCEPTION` <a name="construct-hub.SpdxLicense.property.CAL_1_0_COMBINED_WORK_EXCEPTION" id="constructhubspdxlicensepropertycal10combinedworkexception"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Cryptographic Autonomy License 1.0 (Combined Work Exception).

> http://cryptographicautonomylicense.com/license-text.html

---

##### `CALDERA` <a name="construct-hub.SpdxLicense.property.CALDERA" id="constructhubspdxlicensepropertycaldera"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Caldera License.

> http://www.lemis.com/grog/UNIX/ancient-source-all.pdf

---

##### `CATOSL_1_1` <a name="construct-hub.SpdxLicense.property.CATOSL_1_1" id="constructhubspdxlicensepropertycatosl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Computer Associates Trusted Open Source License 1.1.

> https://opensource.org/licenses/CATOSL-1.1

---

##### `CC_BY_1_0` <a name="construct-hub.SpdxLicense.property.CC_BY_1_0" id="constructhubspdxlicensepropertyccby10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 1.0 Generic.

> https://creativecommons.org/licenses/by/1.0/legalcode

---

##### `CC_BY_2_0` <a name="construct-hub.SpdxLicense.property.CC_BY_2_0" id="constructhubspdxlicensepropertyccby20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 2.0 Generic.

> https://creativecommons.org/licenses/by/2.0/legalcode

---

##### `CC_BY_2_5` <a name="construct-hub.SpdxLicense.property.CC_BY_2_5" id="constructhubspdxlicensepropertyccby25"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 2.5 Generic.

> https://creativecommons.org/licenses/by/2.5/legalcode

---

##### `CC_BY_3_0` <a name="construct-hub.SpdxLicense.property.CC_BY_3_0" id="constructhubspdxlicensepropertyccby30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 3.0 Unported.

> https://creativecommons.org/licenses/by/3.0/legalcode

---

##### `CC_BY_3_0_AT` <a name="construct-hub.SpdxLicense.property.CC_BY_3_0_AT" id="constructhubspdxlicensepropertyccby30at"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 3.0 Austria.

> https://creativecommons.org/licenses/by/3.0/at/legalcode

---

##### `CC_BY_3_0_US` <a name="construct-hub.SpdxLicense.property.CC_BY_3_0_US" id="constructhubspdxlicensepropertyccby30us"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 3.0 United States.

> https://creativecommons.org/licenses/by/3.0/us/legalcode

---

##### `CC_BY_4_0` <a name="construct-hub.SpdxLicense.property.CC_BY_4_0" id="constructhubspdxlicensepropertyccby40"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution 4.0 International.

> https://creativecommons.org/licenses/by/4.0/legalcode

---

##### `CC_BY_NC_1_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_1_0" id="constructhubspdxlicensepropertyccbync10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial 1.0 Generic.

> https://creativecommons.org/licenses/by-nc/1.0/legalcode

---

##### `CC_BY_NC_2_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_2_0" id="constructhubspdxlicensepropertyccbync20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial 2.0 Generic.

> https://creativecommons.org/licenses/by-nc/2.0/legalcode

---

##### `CC_BY_NC_2_5` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_2_5" id="constructhubspdxlicensepropertyccbync25"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial 2.5 Generic.

> https://creativecommons.org/licenses/by-nc/2.5/legalcode

---

##### `CC_BY_NC_3_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_3_0" id="constructhubspdxlicensepropertyccbync30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial 3.0 Unported.

> https://creativecommons.org/licenses/by-nc/3.0/legalcode

---

##### `CC_BY_NC_4_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_4_0" id="constructhubspdxlicensepropertyccbync40"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial 4.0 International.

> https://creativecommons.org/licenses/by-nc/4.0/legalcode

---

##### `CC_BY_NC_ND_1_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_ND_1_0" id="constructhubspdxlicensepropertyccbyncnd10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial No Derivatives 1.0 Generic.

> https://creativecommons.org/licenses/by-nd-nc/1.0/legalcode

---

##### `CC_BY_NC_ND_2_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_ND_2_0" id="constructhubspdxlicensepropertyccbyncnd20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial No Derivatives 2.0 Generic.

> https://creativecommons.org/licenses/by-nc-nd/2.0/legalcode

---

##### `CC_BY_NC_ND_2_5` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_ND_2_5" id="constructhubspdxlicensepropertyccbyncnd25"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial No Derivatives 2.5 Generic.

> https://creativecommons.org/licenses/by-nc-nd/2.5/legalcode

---

##### `CC_BY_NC_ND_3_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_ND_3_0" id="constructhubspdxlicensepropertyccbyncnd30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial No Derivatives 3.0 Unported.

> https://creativecommons.org/licenses/by-nc-nd/3.0/legalcode

---

##### `CC_BY_NC_ND_3_0_IGO` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_ND_3_0_IGO" id="constructhubspdxlicensepropertyccbyncnd30igo"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial No Derivatives 3.0 IGO.

> https://creativecommons.org/licenses/by-nc-nd/3.0/igo/legalcode

---

##### `CC_BY_NC_ND_4_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_ND_4_0" id="constructhubspdxlicensepropertyccbyncnd40"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial No Derivatives 4.0 International.

> https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode

---

##### `CC_BY_NC_SA_1_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_SA_1_0" id="constructhubspdxlicensepropertyccbyncsa10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial Share Alike 1.0 Generic.

> https://creativecommons.org/licenses/by-nc-sa/1.0/legalcode

---

##### `CC_BY_NC_SA_2_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_SA_2_0" id="constructhubspdxlicensepropertyccbyncsa20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial Share Alike 2.0 Generic.

> https://creativecommons.org/licenses/by-nc-sa/2.0/legalcode

---

##### `CC_BY_NC_SA_2_5` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_SA_2_5" id="constructhubspdxlicensepropertyccbyncsa25"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial Share Alike 2.5 Generic.

> https://creativecommons.org/licenses/by-nc-sa/2.5/legalcode

---

##### `CC_BY_NC_SA_3_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_SA_3_0" id="constructhubspdxlicensepropertyccbyncsa30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial Share Alike 3.0 Unported.

> https://creativecommons.org/licenses/by-nc-sa/3.0/legalcode

---

##### `CC_BY_NC_SA_4_0` <a name="construct-hub.SpdxLicense.property.CC_BY_NC_SA_4_0" id="constructhubspdxlicensepropertyccbyncsa40"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Non Commercial Share Alike 4.0 International.

> https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode

---

##### `CC_BY_ND_1_0` <a name="construct-hub.SpdxLicense.property.CC_BY_ND_1_0" id="constructhubspdxlicensepropertyccbynd10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution No Derivatives 1.0 Generic.

> https://creativecommons.org/licenses/by-nd/1.0/legalcode

---

##### `CC_BY_ND_2_0` <a name="construct-hub.SpdxLicense.property.CC_BY_ND_2_0" id="constructhubspdxlicensepropertyccbynd20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution No Derivatives 2.0 Generic.

> https://creativecommons.org/licenses/by-nd/2.0/legalcode

---

##### `CC_BY_ND_2_5` <a name="construct-hub.SpdxLicense.property.CC_BY_ND_2_5" id="constructhubspdxlicensepropertyccbynd25"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution No Derivatives 2.5 Generic.

> https://creativecommons.org/licenses/by-nd/2.5/legalcode

---

##### `CC_BY_ND_3_0` <a name="construct-hub.SpdxLicense.property.CC_BY_ND_3_0" id="constructhubspdxlicensepropertyccbynd30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution No Derivatives 3.0 Unported.

> https://creativecommons.org/licenses/by-nd/3.0/legalcode

---

##### `CC_BY_ND_4_0` <a name="construct-hub.SpdxLicense.property.CC_BY_ND_4_0" id="constructhubspdxlicensepropertyccbynd40"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution No Derivatives 4.0 International.

> https://creativecommons.org/licenses/by-nd/4.0/legalcode

---

##### `CC_BY_SA_1_0` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_1_0" id="constructhubspdxlicensepropertyccbysa10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Share Alike 1.0 Generic.

> https://creativecommons.org/licenses/by-sa/1.0/legalcode

---

##### `CC_BY_SA_2_0` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_2_0" id="constructhubspdxlicensepropertyccbysa20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Share Alike 2.0 Generic.

> https://creativecommons.org/licenses/by-sa/2.0/legalcode

---

##### `CC_BY_SA_2_0_UK` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_2_0_UK" id="constructhubspdxlicensepropertyccbysa20uk"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Share Alike 2.0 England and Wales.

> https://creativecommons.org/licenses/by-sa/2.0/uk/legalcode

---

##### `CC_BY_SA_2_5` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_2_5" id="constructhubspdxlicensepropertyccbysa25"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Share Alike 2.5 Generic.

> https://creativecommons.org/licenses/by-sa/2.5/legalcode

---

##### `CC_BY_SA_3_0` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_3_0" id="constructhubspdxlicensepropertyccbysa30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Share Alike 3.0 Unported.

> https://creativecommons.org/licenses/by-sa/3.0/legalcode

---

##### `CC_BY_SA_3_0_AT` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_3_0_AT" id="constructhubspdxlicensepropertyccbysa30at"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution-Share Alike 3.0 Austria.

> https://creativecommons.org/licenses/by-sa/3.0/at/legalcode

---

##### `CC_BY_SA_4_0` <a name="construct-hub.SpdxLicense.property.CC_BY_SA_4_0" id="constructhubspdxlicensepropertyccbysa40"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Attribution Share Alike 4.0 International.

> https://creativecommons.org/licenses/by-sa/4.0/legalcode

---

##### `CC_PDDC` <a name="construct-hub.SpdxLicense.property.CC_PDDC" id="constructhubspdxlicensepropertyccpddc"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Public Domain Dedication and Certification.

> https://creativecommons.org/licenses/publicdomain/

---

##### `CC0_1_0` <a name="construct-hub.SpdxLicense.property.CC0_1_0" id="constructhubspdxlicensepropertycc010"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Creative Commons Zero v1.0 Universal.

> https://creativecommons.org/publicdomain/zero/1.0/legalcode

---

##### `CDDL_1_0` <a name="construct-hub.SpdxLicense.property.CDDL_1_0" id="constructhubspdxlicensepropertycddl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Common Development and Distribution License 1.0.

> https://opensource.org/licenses/cddl1

---

##### `CDDL_1_1` <a name="construct-hub.SpdxLicense.property.CDDL_1_1" id="constructhubspdxlicensepropertycddl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Common Development and Distribution License 1.1.

> http://glassfish.java.net/public/CDDL+GPL_1_1.html

---

##### `CDLA_PERMISSIVE_1_0` <a name="construct-hub.SpdxLicense.property.CDLA_PERMISSIVE_1_0" id="constructhubspdxlicensepropertycdlapermissive10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Community Data License Agreement Permissive 1.0.

> https://cdla.io/permissive-1-0

---

##### `CDLA_SHARING_1_0` <a name="construct-hub.SpdxLicense.property.CDLA_SHARING_1_0" id="constructhubspdxlicensepropertycdlasharing10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Community Data License Agreement Sharing 1.0.

> https://cdla.io/sharing-1-0

---

##### `CECILL_1_0` <a name="construct-hub.SpdxLicense.property.CECILL_1_0" id="constructhubspdxlicensepropertycecill10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CeCILL Free Software License Agreement v1.0.

> http://www.cecill.info/licences/Licence_CeCILL_V1-fr.html

---

##### `CECILL_1_1` <a name="construct-hub.SpdxLicense.property.CECILL_1_1" id="constructhubspdxlicensepropertycecill11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CeCILL Free Software License Agreement v1.1.

> http://www.cecill.info/licences/Licence_CeCILL_V1.1-US.html

---

##### `CECILL_2_0` <a name="construct-hub.SpdxLicense.property.CECILL_2_0" id="constructhubspdxlicensepropertycecill20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CeCILL Free Software License Agreement v2.0.

> http://www.cecill.info/licences/Licence_CeCILL_V2-en.html

---

##### `CECILL_2_1` <a name="construct-hub.SpdxLicense.property.CECILL_2_1" id="constructhubspdxlicensepropertycecill21"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CeCILL Free Software License Agreement v2.1.

> http://www.cecill.info/licences/Licence_CeCILL_V2.1-en.html

---

##### `CECILL_B` <a name="construct-hub.SpdxLicense.property.CECILL_B" id="constructhubspdxlicensepropertycecillb"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CeCILL-B Free Software License Agreement.

> http://www.cecill.info/licences/Licence_CeCILL-B_V1-en.html

---

##### `CECILL_C` <a name="construct-hub.SpdxLicense.property.CECILL_C" id="constructhubspdxlicensepropertycecillc"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CeCILL-C Free Software License Agreement.

> http://www.cecill.info/licences/Licence_CeCILL-C_V1-en.html

---

##### `CERN_OHL_1_1` <a name="construct-hub.SpdxLicense.property.CERN_OHL_1_1" id="constructhubspdxlicensepropertycernohl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CERN Open Hardware Licence v1.1.

> https://www.ohwr.org/project/licenses/wikis/cern-ohl-v1.1

---

##### `CERN_OHL_1_2` <a name="construct-hub.SpdxLicense.property.CERN_OHL_1_2" id="constructhubspdxlicensepropertycernohl12"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CERN Open Hardware Licence v1.2.

> https://www.ohwr.org/project/licenses/wikis/cern-ohl-v1.2

---

##### `CERN_OHL_P_2_0` <a name="construct-hub.SpdxLicense.property.CERN_OHL_P_2_0" id="constructhubspdxlicensepropertycernohlp20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CERN Open Hardware Licence Version 2 - Permissive.

> https://www.ohwr.org/project/cernohl/wikis/Documents/CERN-OHL-version-2

---

##### `CERN_OHL_S_2_0` <a name="construct-hub.SpdxLicense.property.CERN_OHL_S_2_0" id="constructhubspdxlicensepropertycernohls20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CERN Open Hardware Licence Version 2 - Strongly Reciprocal.

> https://www.ohwr.org/project/cernohl/wikis/Documents/CERN-OHL-version-2

---

##### `CERN_OHL_W_2_0` <a name="construct-hub.SpdxLicense.property.CERN_OHL_W_2_0" id="constructhubspdxlicensepropertycernohlw20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CERN Open Hardware Licence Version 2 - Weakly Reciprocal.

> https://www.ohwr.org/project/cernohl/wikis/Documents/CERN-OHL-version-2

---

##### `CL_ARTISTIC` <a name="construct-hub.SpdxLicense.property.CL_ARTISTIC" id="constructhubspdxlicensepropertyclartistic"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Clarified Artistic License.

> http://gianluca.dellavedova.org/2011/01/03/clarified-artistic-license/

---

##### `CNRI_JYTHON` <a name="construct-hub.SpdxLicense.property.CNRI_JYTHON" id="constructhubspdxlicensepropertycnrijython"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CNRI Jython License.

> http://www.jython.org/license.html

---

##### `CNRI_PYTHON` <a name="construct-hub.SpdxLicense.property.CNRI_PYTHON" id="constructhubspdxlicensepropertycnripython"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CNRI Python License.

> https://opensource.org/licenses/CNRI-Python

---

##### `CNRI_PYTHON_GPL_COMPATIBLE` <a name="construct-hub.SpdxLicense.property.CNRI_PYTHON_GPL_COMPATIBLE" id="constructhubspdxlicensepropertycnripythongplcompatible"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CNRI Python Open Source GPL Compatible License Agreement.

> http://www.python.org/download/releases/1.6.1/download_win/

---

##### `CONDOR_1_1` <a name="construct-hub.SpdxLicense.property.CONDOR_1_1" id="constructhubspdxlicensepropertycondor11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Condor Public License v1.1.

> http://research.cs.wisc.edu/condor/license.html#condor

---

##### `COPYLEFT_NEXT_0_3_0` <a name="construct-hub.SpdxLicense.property.COPYLEFT_NEXT_0_3_0" id="constructhubspdxlicensepropertycopyleftnext030"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

copyleft-next 0.3.0.

> https://github.com/copyleft-next/copyleft-next/blob/master/Releases/copyleft-next-0.3.0

---

##### `COPYLEFT_NEXT_0_3_1` <a name="construct-hub.SpdxLicense.property.COPYLEFT_NEXT_0_3_1" id="constructhubspdxlicensepropertycopyleftnext031"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

copyleft-next 0.3.1.

> https://github.com/copyleft-next/copyleft-next/blob/master/Releases/copyleft-next-0.3.1

---

##### `CPAL_1_0` <a name="construct-hub.SpdxLicense.property.CPAL_1_0" id="constructhubspdxlicensepropertycpal10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Common Public Attribution License 1.0.

> https://opensource.org/licenses/CPAL-1.0

---

##### `CPL_1_0` <a name="construct-hub.SpdxLicense.property.CPL_1_0" id="constructhubspdxlicensepropertycpl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Common Public License 1.0.

> https://opensource.org/licenses/CPL-1.0

---

##### `CPOL_1_02` <a name="construct-hub.SpdxLicense.property.CPOL_1_02" id="constructhubspdxlicensepropertycpol102"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Code Project Open License 1.02.

> http://www.codeproject.com/info/cpol10.aspx

---

##### `CROSSWORD` <a name="construct-hub.SpdxLicense.property.CROSSWORD" id="constructhubspdxlicensepropertycrossword"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Crossword License.

> https://fedoraproject.org/wiki/Licensing/Crossword

---

##### `CRYSTAL_STACKER` <a name="construct-hub.SpdxLicense.property.CRYSTAL_STACKER" id="constructhubspdxlicensepropertycrystalstacker"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CrystalStacker License.

> https://fedoraproject.org/wiki/Licensing:CrystalStacker?rd=Licensing/CrystalStacker

---

##### `CUA_OPL_1_0` <a name="construct-hub.SpdxLicense.property.CUA_OPL_1_0" id="constructhubspdxlicensepropertycuaopl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CUA Office Public License v1.0.

> https://opensource.org/licenses/CUA-OPL-1.0

---

##### `CUBE` <a name="construct-hub.SpdxLicense.property.CUBE" id="constructhubspdxlicensepropertycube"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Cube License.

> https://fedoraproject.org/wiki/Licensing/Cube

---

##### `CURL` <a name="construct-hub.SpdxLicense.property.CURL" id="constructhubspdxlicensepropertycurl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

curl License.

> https://github.com/bagder/curl/blob/master/COPYING

---

##### `D_FSL_1_0` <a name="construct-hub.SpdxLicense.property.D_FSL_1_0" id="constructhubspdxlicensepropertydfsl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Deutsche Freie Software Lizenz.

> http://www.dipp.nrw.de/d-fsl/lizenzen/

---

##### `DIFFMARK` <a name="construct-hub.SpdxLicense.property.DIFFMARK" id="constructhubspdxlicensepropertydiffmark"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

diffmark license.

> https://fedoraproject.org/wiki/Licensing/diffmark

---

##### `DOC` <a name="construct-hub.SpdxLicense.property.DOC" id="constructhubspdxlicensepropertydoc"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

DOC License.

> http://www.cs.wustl.edu/~schmidt/ACE-copying.html

---

##### `DOTSEQN` <a name="construct-hub.SpdxLicense.property.DOTSEQN" id="constructhubspdxlicensepropertydotseqn"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Dotseqn License.

> https://fedoraproject.org/wiki/Licensing/Dotseqn

---

##### `DSDP` <a name="construct-hub.SpdxLicense.property.DSDP" id="constructhubspdxlicensepropertydsdp"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

DSDP License.

> https://fedoraproject.org/wiki/Licensing/DSDP

---

##### `DVIPDFM` <a name="construct-hub.SpdxLicense.property.DVIPDFM" id="constructhubspdxlicensepropertydvipdfm"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

dvipdfm License.

> https://fedoraproject.org/wiki/Licensing/dvipdfm

---

##### `E_GENIX` <a name="construct-hub.SpdxLicense.property.E_GENIX" id="constructhubspdxlicensepropertyegenix"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

eGenix.com Public License 1.1.0.

> http://www.egenix.com/products/eGenix.com-Public-License-1.1.0.pdf

---

##### `ECL_1_0` <a name="construct-hub.SpdxLicense.property.ECL_1_0" id="constructhubspdxlicensepropertyecl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Educational Community License v1.0.

> https://opensource.org/licenses/ECL-1.0

---

##### `ECL_2_0` <a name="construct-hub.SpdxLicense.property.ECL_2_0" id="constructhubspdxlicensepropertyecl20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Educational Community License v2.0.

> https://opensource.org/licenses/ECL-2.0

---

##### `ECOS_2_0` <a name="construct-hub.SpdxLicense.property.ECOS_2_0" id="constructhubspdxlicensepropertyecos20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

eCos license version 2.0.

> https://www.gnu.org/licenses/ecos-license.html

---

##### `EFL_1_0` <a name="construct-hub.SpdxLicense.property.EFL_1_0" id="constructhubspdxlicensepropertyefl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Eiffel Forum License v1.0.

> http://www.eiffel-nice.org/license/forum.txt

---

##### `EFL_2_0` <a name="construct-hub.SpdxLicense.property.EFL_2_0" id="constructhubspdxlicensepropertyefl20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Eiffel Forum License v2.0.

> http://www.eiffel-nice.org/license/eiffel-forum-license-2.html

---

##### `ENTESSA` <a name="construct-hub.SpdxLicense.property.ENTESSA" id="constructhubspdxlicensepropertyentessa"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Entessa Public License v1.0.

> https://opensource.org/licenses/Entessa

---

##### `EPICS` <a name="construct-hub.SpdxLicense.property.EPICS" id="constructhubspdxlicensepropertyepics"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

EPICS Open License.

> https://epics.anl.gov/license/open.php

---

##### `EPL_1_0` <a name="construct-hub.SpdxLicense.property.EPL_1_0" id="constructhubspdxlicensepropertyepl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Eclipse Public License 1.0.

> http://www.eclipse.org/legal/epl-v10.html

---

##### `EPL_2_0` <a name="construct-hub.SpdxLicense.property.EPL_2_0" id="constructhubspdxlicensepropertyepl20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Eclipse Public License 2.0.

> https://www.eclipse.org/legal/epl-2.0

---

##### `ERLPL_1_1` <a name="construct-hub.SpdxLicense.property.ERLPL_1_1" id="constructhubspdxlicensepropertyerlpl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Erlang Public License v1.1.

> http://www.erlang.org/EPLICENSE

---

##### `ETALAB_2_0` <a name="construct-hub.SpdxLicense.property.ETALAB_2_0" id="constructhubspdxlicensepropertyetalab20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Etalab Open License 2.0.

> https://github.com/DISIC/politique-de-contribution-open-source/blob/master/LICENSE.pdf

---

##### `EUDATAGRID` <a name="construct-hub.SpdxLicense.property.EUDATAGRID" id="constructhubspdxlicensepropertyeudatagrid"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

EU DataGrid Software License.

> http://eu-datagrid.web.cern.ch/eu-datagrid/license.html

---

##### `EUPL_1_0` <a name="construct-hub.SpdxLicense.property.EUPL_1_0" id="constructhubspdxlicensepropertyeupl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

European Union Public License 1.0.

> http://ec.europa.eu/idabc/en/document/7330.html

---

##### `EUPL_1_1` <a name="construct-hub.SpdxLicense.property.EUPL_1_1" id="constructhubspdxlicensepropertyeupl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

European Union Public License 1.1.

> https://joinup.ec.europa.eu/software/page/eupl/licence-eupl

---

##### `EUPL_1_2` <a name="construct-hub.SpdxLicense.property.EUPL_1_2" id="constructhubspdxlicensepropertyeupl12"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

European Union Public License 1.2.

> https://joinup.ec.europa.eu/page/eupl-text-11-12

---

##### `EUROSYM` <a name="construct-hub.SpdxLicense.property.EUROSYM" id="constructhubspdxlicensepropertyeurosym"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Eurosym License.

> https://fedoraproject.org/wiki/Licensing/Eurosym

---

##### `FAIR` <a name="construct-hub.SpdxLicense.property.FAIR" id="constructhubspdxlicensepropertyfair"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Fair License.

> http://fairlicense.org/

---

##### `FRAMEWORX_1_0` <a name="construct-hub.SpdxLicense.property.FRAMEWORX_1_0" id="constructhubspdxlicensepropertyframeworx10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Frameworx Open License 1.0.

> https://opensource.org/licenses/Frameworx-1.0

---

##### `FREE_IMAGE` <a name="construct-hub.SpdxLicense.property.FREE_IMAGE" id="constructhubspdxlicensepropertyfreeimage"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

FreeImage Public License v1.0.

> http://freeimage.sourceforge.net/freeimage-license.txt

---

##### `FSFAP` <a name="construct-hub.SpdxLicense.property.FSFAP" id="constructhubspdxlicensepropertyfsfap"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

FSF All Permissive License.

> https://www.gnu.org/prep/maintain/html_node/License-Notices-for-Other-Files.html

---

##### `FSFUL` <a name="construct-hub.SpdxLicense.property.FSFUL" id="constructhubspdxlicensepropertyfsful"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

FSF Unlimited License.

> https://fedoraproject.org/wiki/Licensing/FSF_Unlimited_License

---

##### `FSFULLR` <a name="construct-hub.SpdxLicense.property.FSFULLR" id="constructhubspdxlicensepropertyfsfullr"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

FSF Unlimited License (with License Retention).

> https://fedoraproject.org/wiki/Licensing/FSF_Unlimited_License#License_Retention_Variant

---

##### `FTL` <a name="construct-hub.SpdxLicense.property.FTL" id="constructhubspdxlicensepropertyftl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Freetype Project License.

> http://freetype.fis.uniroma2.it/FTL.TXT

---

##### `GFDL_1_1` <a name="construct-hub.SpdxLicense.property.GFDL_1_1" id="constructhubspdxlicensepropertygfdl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_1_INVARIANTS_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_1_INVARIANTS_ONLY" id="constructhubspdxlicensepropertygfdl11invariantsonly"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1 only - invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_1_INVARIANTS_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_1_INVARIANTS_OR_LATER" id="constructhubspdxlicensepropertygfdl11invariantsorlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1 or later - invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_1_NO_INVARIANTS_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_1_NO_INVARIANTS_ONLY" id="constructhubspdxlicensepropertygfdl11noinvariantsonly"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1 only - no invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_1_NO_INVARIANTS_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_1_NO_INVARIANTS_OR_LATER" id="constructhubspdxlicensepropertygfdl11noinvariantsorlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1 or later - no invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_1_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_1_ONLY" id="constructhubspdxlicensepropertygfdl11only"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1 only.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_1_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_1_OR_LATER" id="constructhubspdxlicensepropertygfdl11orlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.1 or later.

> https://www.gnu.org/licenses/old-licenses/fdl-1.1.txt

---

##### `GFDL_1_2` <a name="construct-hub.SpdxLicense.property.GFDL_1_2" id="constructhubspdxlicensepropertygfdl12"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_2_INVARIANTS_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_2_INVARIANTS_ONLY" id="constructhubspdxlicensepropertygfdl12invariantsonly"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2 only - invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_2_INVARIANTS_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_2_INVARIANTS_OR_LATER" id="constructhubspdxlicensepropertygfdl12invariantsorlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2 or later - invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_2_NO_INVARIANTS_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_2_NO_INVARIANTS_ONLY" id="constructhubspdxlicensepropertygfdl12noinvariantsonly"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2 only - no invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_2_NO_INVARIANTS_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_2_NO_INVARIANTS_OR_LATER" id="constructhubspdxlicensepropertygfdl12noinvariantsorlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2 or later - no invariants.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_2_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_2_ONLY" id="constructhubspdxlicensepropertygfdl12only"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2 only.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_2_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_2_OR_LATER" id="constructhubspdxlicensepropertygfdl12orlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.2 or later.

> https://www.gnu.org/licenses/old-licenses/fdl-1.2.txt

---

##### `GFDL_1_3` <a name="construct-hub.SpdxLicense.property.GFDL_1_3" id="constructhubspdxlicensepropertygfdl13"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GFDL_1_3_INVARIANTS_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_3_INVARIANTS_ONLY" id="constructhubspdxlicensepropertygfdl13invariantsonly"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3 only - invariants.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GFDL_1_3_INVARIANTS_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_3_INVARIANTS_OR_LATER" id="constructhubspdxlicensepropertygfdl13invariantsorlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3 or later - invariants.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GFDL_1_3_NO_INVARIANTS_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_3_NO_INVARIANTS_ONLY" id="constructhubspdxlicensepropertygfdl13noinvariantsonly"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3 only - no invariants.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GFDL_1_3_NO_INVARIANTS_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_3_NO_INVARIANTS_OR_LATER" id="constructhubspdxlicensepropertygfdl13noinvariantsorlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3 or later - no invariants.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GFDL_1_3_ONLY` <a name="construct-hub.SpdxLicense.property.GFDL_1_3_ONLY" id="constructhubspdxlicensepropertygfdl13only"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3 only.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GFDL_1_3_OR_LATER` <a name="construct-hub.SpdxLicense.property.GFDL_1_3_OR_LATER" id="constructhubspdxlicensepropertygfdl13orlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Free Documentation License v1.3 or later.

> https://www.gnu.org/licenses/fdl-1.3.txt

---

##### `GIFTWARE` <a name="construct-hub.SpdxLicense.property.GIFTWARE" id="constructhubspdxlicensepropertygiftware"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Giftware License.

> http://liballeg.org/license.html#allegro-4-the-giftware-license

---

##### `GL2_P_S` <a name="construct-hub.SpdxLicense.property.GL2_P_S" id="constructhubspdxlicensepropertygl2ps"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GL2PS License.

> http://www.geuz.org/gl2ps/COPYING.GL2PS

---

##### `GLIDE` <a name="construct-hub.SpdxLicense.property.GLIDE" id="constructhubspdxlicensepropertyglide"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

3dfx Glide License.

> http://www.users.on.net/~triforce/glidexp/COPYING.txt

---

##### `GLULXE` <a name="construct-hub.SpdxLicense.property.GLULXE" id="constructhubspdxlicensepropertyglulxe"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Glulxe License.

> https://fedoraproject.org/wiki/Licensing/Glulxe

---

##### `GLWTPL` <a name="construct-hub.SpdxLicense.property.GLWTPL" id="constructhubspdxlicensepropertyglwtpl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Good Luck With That Public License.

> https://github.com/me-shaon/GLWTPL/commit/da5f6bc734095efbacb442c0b31e33a65b9d6e85

---

##### `GNUPLOT` <a name="construct-hub.SpdxLicense.property.GNUPLOT" id="constructhubspdxlicensepropertygnuplot"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

gnuplot License.

> https://fedoraproject.org/wiki/Licensing/Gnuplot

---

##### `GPL_1_0` <a name="construct-hub.SpdxLicense.property.GPL_1_0" id="constructhubspdxlicensepropertygpl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v1.0 only.

> https://www.gnu.org/licenses/old-licenses/gpl-1.0-standalone.html

---

##### `GPL_1_0_ONLY` <a name="construct-hub.SpdxLicense.property.GPL_1_0_ONLY" id="constructhubspdxlicensepropertygpl10only"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v1.0 only.

> https://www.gnu.org/licenses/old-licenses/gpl-1.0-standalone.html

---

##### `GPL_1_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.GPL_1_0_OR_LATER" id="constructhubspdxlicensepropertygpl10orlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v1.0 or later.

> https://www.gnu.org/licenses/old-licenses/gpl-1.0-standalone.html

---

##### `GPL_1_0_PLUS` <a name="construct-hub.SpdxLicense.property.GPL_1_0_PLUS" id="constructhubspdxlicensepropertygpl10plus"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v1.0 or later.

> https://www.gnu.org/licenses/old-licenses/gpl-1.0-standalone.html

---

##### `GPL_2_0` <a name="construct-hub.SpdxLicense.property.GPL_2_0" id="constructhubspdxlicensepropertygpl20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 only.

> https://www.gnu.org/licenses/old-licenses/gpl-2.0-standalone.html

---

##### `GPL_2_0_ONLY` <a name="construct-hub.SpdxLicense.property.GPL_2_0_ONLY" id="constructhubspdxlicensepropertygpl20only"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 only.

> https://www.gnu.org/licenses/old-licenses/gpl-2.0-standalone.html

---

##### `GPL_2_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.GPL_2_0_OR_LATER" id="constructhubspdxlicensepropertygpl20orlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 or later.

> https://www.gnu.org/licenses/old-licenses/gpl-2.0-standalone.html

---

##### `GPL_2_0_PLUS` <a name="construct-hub.SpdxLicense.property.GPL_2_0_PLUS" id="constructhubspdxlicensepropertygpl20plus"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 or later.

> https://www.gnu.org/licenses/old-licenses/gpl-2.0-standalone.html

---

##### `GPL_2_0_WITH_AUTOCONF_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_2_0_WITH_AUTOCONF_EXCEPTION" id="constructhubspdxlicensepropertygpl20withautoconfexception"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 w/Autoconf exception.

> http://ac-archive.sourceforge.net/doc/copyright.html

---

##### `GPL_2_0_WITH_BISON_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_2_0_WITH_BISON_EXCEPTION" id="constructhubspdxlicensepropertygpl20withbisonexception"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 w/Bison exception.

> http://git.savannah.gnu.org/cgit/bison.git/tree/data/yacc.c?id=193d7c7054ba7197b0789e14965b739162319b5e#n141

---

##### `GPL_2_0_WITH_CLASSPATH_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_2_0_WITH_CLASSPATH_EXCEPTION" id="constructhubspdxlicensepropertygpl20withclasspathexception"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 w/Classpath exception.

> https://www.gnu.org/software/classpath/license.html

---

##### `GPL_2_0_WITH_FONT_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_2_0_WITH_FONT_EXCEPTION" id="constructhubspdxlicensepropertygpl20withfontexception"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 w/Font exception.

> https://www.gnu.org/licenses/gpl-faq.html#FontException

---

##### `GPL_2_0_WITH_GCC_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_2_0_WITH_GCC_EXCEPTION" id="constructhubspdxlicensepropertygpl20withgccexception"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v2.0 w/GCC Runtime Library exception.

> https://gcc.gnu.org/git/?p=gcc.git;a=blob;f=gcc/libgcc1.c;h=762f5143fc6eed57b6797c82710f3538aa52b40b;hb=cb143a3ce4fb417c68f5fa2691a1b1b1053dfba9#l10

---

##### `GPL_3_0` <a name="construct-hub.SpdxLicense.property.GPL_3_0" id="constructhubspdxlicensepropertygpl30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v3.0 only.

> https://www.gnu.org/licenses/gpl-3.0-standalone.html

---

##### `GPL_3_0_ONLY` <a name="construct-hub.SpdxLicense.property.GPL_3_0_ONLY" id="constructhubspdxlicensepropertygpl30only"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v3.0 only.

> https://www.gnu.org/licenses/gpl-3.0-standalone.html

---

##### `GPL_3_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.GPL_3_0_OR_LATER" id="constructhubspdxlicensepropertygpl30orlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v3.0 or later.

> https://www.gnu.org/licenses/gpl-3.0-standalone.html

---

##### `GPL_3_0_PLUS` <a name="construct-hub.SpdxLicense.property.GPL_3_0_PLUS" id="constructhubspdxlicensepropertygpl30plus"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v3.0 or later.

> https://www.gnu.org/licenses/gpl-3.0-standalone.html

---

##### `GPL_3_0_WITH_AUTOCONF_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_3_0_WITH_AUTOCONF_EXCEPTION" id="constructhubspdxlicensepropertygpl30withautoconfexception"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v3.0 w/Autoconf exception.

> https://www.gnu.org/licenses/autoconf-exception-3.0.html

---

##### `GPL_3_0_WITH_GCC_EXCEPTION` <a name="construct-hub.SpdxLicense.property.GPL_3_0_WITH_GCC_EXCEPTION" id="constructhubspdxlicensepropertygpl30withgccexception"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU General Public License v3.0 w/GCC Runtime Library exception.

> https://www.gnu.org/licenses/gcc-exception-3.1.html

---

##### `GSOAP_1_3B` <a name="construct-hub.SpdxLicense.property.GSOAP_1_3B" id="constructhubspdxlicensepropertygsoap13b"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

gSOAP Public License v1.3b.

> http://www.cs.fsu.edu/~engelen/license.html

---

##### `HASKELL_REPORT` <a name="construct-hub.SpdxLicense.property.HASKELL_REPORT" id="constructhubspdxlicensepropertyhaskellreport"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Haskell Language Report License.

> https://fedoraproject.org/wiki/Licensing/Haskell_Language_Report_License

---

##### `HIPPOCRATIC_2_1` <a name="construct-hub.SpdxLicense.property.HIPPOCRATIC_2_1" id="constructhubspdxlicensepropertyhippocratic21"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Hippocratic License 2.1.

> https://firstdonoharm.dev/version/2/1/license.html

---

##### `HPND` <a name="construct-hub.SpdxLicense.property.HPND" id="constructhubspdxlicensepropertyhpnd"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Historical Permission Notice and Disclaimer.

> https://opensource.org/licenses/HPND

---

##### `HPND_SELL_VARIANT` <a name="construct-hub.SpdxLicense.property.HPND_SELL_VARIANT" id="constructhubspdxlicensepropertyhpndsellvariant"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Historical Permission Notice and Disclaimer - sell variant.

> https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/net/sunrpc/auth_gss/gss_generic_token.c?h=v4.19

---

##### `HTMLTIDY` <a name="construct-hub.SpdxLicense.property.HTMLTIDY" id="constructhubspdxlicensepropertyhtmltidy"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

HTML Tidy License.

> https://github.com/htacg/tidy-html5/blob/next/README/LICENSE.md

---

##### `I_MATIX` <a name="construct-hub.SpdxLicense.property.I_MATIX" id="constructhubspdxlicensepropertyimatix"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

iMatix Standard Function Library Agreement.

> http://legacy.imatix.com/html/sfl/sfl4.htm#license

---

##### `IBM_PIBS` <a name="construct-hub.SpdxLicense.property.IBM_PIBS" id="constructhubspdxlicensepropertyibmpibs"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

IBM PowerPC Initialization and Boot Software.

> http://git.denx.de/?p=u-boot.git;a=blob;f=arch/powerpc/cpu/ppc4xx/miiphy.c;h=297155fdafa064b955e53e9832de93bfb0cfb85b;hb=9fab4bf4cc077c21e43941866f3f2c196f28670d

---

##### `ICU` <a name="construct-hub.SpdxLicense.property.ICU" id="constructhubspdxlicensepropertyicu"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ICU License.

> http://source.icu-project.org/repos/icu/icu/trunk/license.html

---

##### `IJG` <a name="construct-hub.SpdxLicense.property.IJG" id="constructhubspdxlicensepropertyijg"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Independent JPEG Group License.

> http://dev.w3.org/cvsweb/Amaya/libjpeg/Attic/README?rev=1.2

---

##### `IMAGE_MAGICK` <a name="construct-hub.SpdxLicense.property.IMAGE_MAGICK" id="constructhubspdxlicensepropertyimagemagick"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ImageMagick License.

> http://www.imagemagick.org/script/license.php

---

##### `IMLIB2` <a name="construct-hub.SpdxLicense.property.IMLIB2" id="constructhubspdxlicensepropertyimlib2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Imlib2 License.

> http://trac.enlightenment.org/e/browser/trunk/imlib2/COPYING

---

##### `INFO_ZIP` <a name="construct-hub.SpdxLicense.property.INFO_ZIP" id="constructhubspdxlicensepropertyinfozip"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Info-ZIP License.

> http://www.info-zip.org/license.html

---

##### `INTEL` <a name="construct-hub.SpdxLicense.property.INTEL" id="constructhubspdxlicensepropertyintel"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Intel Open Source License.

> https://opensource.org/licenses/Intel

---

##### `INTEL_ACPI` <a name="construct-hub.SpdxLicense.property.INTEL_ACPI" id="constructhubspdxlicensepropertyintelacpi"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Intel ACPI Software License Agreement.

> https://fedoraproject.org/wiki/Licensing/Intel_ACPI_Software_License_Agreement

---

##### `INTERBASE_1_0` <a name="construct-hub.SpdxLicense.property.INTERBASE_1_0" id="constructhubspdxlicensepropertyinterbase10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Interbase Public License v1.0.

> https://web.archive.org/web/20060319014854/http://info.borland.com/devsupport/interbase/opensource/IPL.html

---

##### `IPA` <a name="construct-hub.SpdxLicense.property.IPA" id="constructhubspdxlicensepropertyipa"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

IPA Font License.

> https://opensource.org/licenses/IPA

---

##### `IPL_1_0` <a name="construct-hub.SpdxLicense.property.IPL_1_0" id="constructhubspdxlicensepropertyipl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

IBM Public License v1.0.

> https://opensource.org/licenses/IPL-1.0

---

##### `ISC` <a name="construct-hub.SpdxLicense.property.ISC" id="constructhubspdxlicensepropertyisc"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ISC License.

> https://www.isc.org/downloads/software-support-policy/isc-license/

---

##### `JASPER_2_0` <a name="construct-hub.SpdxLicense.property.JASPER_2_0" id="constructhubspdxlicensepropertyjasper20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

JasPer License.

> http://www.ece.uvic.ca/~mdadams/jasper/LICENSE

---

##### `JPNIC` <a name="construct-hub.SpdxLicense.property.JPNIC" id="constructhubspdxlicensepropertyjpnic"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Japan Network Information Center License.

> https://gitlab.isc.org/isc-projects/bind9/blob/master/COPYRIGHT#L366

---

##### `JSON` <a name="construct-hub.SpdxLicense.property.JSON" id="constructhubspdxlicensepropertyjson"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

JSON License.

> http://www.json.org/license.html

---

##### `LAL_1_2` <a name="construct-hub.SpdxLicense.property.LAL_1_2" id="constructhubspdxlicensepropertylal12"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Licence Art Libre 1.2.

> http://artlibre.org/licence/lal/licence-art-libre-12/

---

##### `LAL_1_3` <a name="construct-hub.SpdxLicense.property.LAL_1_3" id="constructhubspdxlicensepropertylal13"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Licence Art Libre 1.3.

> https://artlibre.org/

---

##### `LATEX2_E` <a name="construct-hub.SpdxLicense.property.LATEX2_E" id="constructhubspdxlicensepropertylatex2e"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Latex2e License.

> https://fedoraproject.org/wiki/Licensing/Latex2e

---

##### `LEPTONICA` <a name="construct-hub.SpdxLicense.property.LEPTONICA" id="constructhubspdxlicensepropertyleptonica"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Leptonica License.

> https://fedoraproject.org/wiki/Licensing/Leptonica

---

##### `LGPL_2_0` <a name="construct-hub.SpdxLicense.property.LGPL_2_0" id="constructhubspdxlicensepropertylgpl20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Library General Public License v2 only.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.0-standalone.html

---

##### `LGPL_2_0_ONLY` <a name="construct-hub.SpdxLicense.property.LGPL_2_0_ONLY" id="constructhubspdxlicensepropertylgpl20only"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Library General Public License v2 only.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.0-standalone.html

---

##### `LGPL_2_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.LGPL_2_0_OR_LATER" id="constructhubspdxlicensepropertylgpl20orlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Library General Public License v2 or later.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.0-standalone.html

---

##### `LGPL_2_0_PLUS` <a name="construct-hub.SpdxLicense.property.LGPL_2_0_PLUS" id="constructhubspdxlicensepropertylgpl20plus"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Library General Public License v2 or later.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.0-standalone.html

---

##### `LGPL_2_1` <a name="construct-hub.SpdxLicense.property.LGPL_2_1" id="constructhubspdxlicensepropertylgpl21"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v2.1 only.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.1-standalone.html

---

##### `LGPL_2_1_ONLY` <a name="construct-hub.SpdxLicense.property.LGPL_2_1_ONLY" id="constructhubspdxlicensepropertylgpl21only"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v2.1 only.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.1-standalone.html

---

##### `LGPL_2_1_OR_LATER` <a name="construct-hub.SpdxLicense.property.LGPL_2_1_OR_LATER" id="constructhubspdxlicensepropertylgpl21orlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v2.1 or later.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.1-standalone.html

---

##### `LGPL_2_1_PLUS` <a name="construct-hub.SpdxLicense.property.LGPL_2_1_PLUS" id="constructhubspdxlicensepropertylgpl21plus"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Library General Public License v2.1 or later.

> https://www.gnu.org/licenses/old-licenses/lgpl-2.1-standalone.html

---

##### `LGPL_3_0` <a name="construct-hub.SpdxLicense.property.LGPL_3_0" id="constructhubspdxlicensepropertylgpl30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v3.0 only.

> https://www.gnu.org/licenses/lgpl-3.0-standalone.html

---

##### `LGPL_3_0_ONLY` <a name="construct-hub.SpdxLicense.property.LGPL_3_0_ONLY" id="constructhubspdxlicensepropertylgpl30only"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v3.0 only.

> https://www.gnu.org/licenses/lgpl-3.0-standalone.html

---

##### `LGPL_3_0_OR_LATER` <a name="construct-hub.SpdxLicense.property.LGPL_3_0_OR_LATER" id="constructhubspdxlicensepropertylgpl30orlater"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v3.0 or later.

> https://www.gnu.org/licenses/lgpl-3.0-standalone.html

---

##### `LGPL_3_0_PLUS` <a name="construct-hub.SpdxLicense.property.LGPL_3_0_PLUS" id="constructhubspdxlicensepropertylgpl30plus"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

GNU Lesser General Public License v3.0 or later.

> https://www.gnu.org/licenses/lgpl-3.0-standalone.html

---

##### `LGPLLR` <a name="construct-hub.SpdxLicense.property.LGPLLR" id="constructhubspdxlicensepropertylgpllr"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Lesser General Public License For Linguistic Resources.

> http://www-igm.univ-mlv.fr/~unitex/lgpllr.html

---

##### `LIBPNG` <a name="construct-hub.SpdxLicense.property.LIBPNG" id="constructhubspdxlicensepropertylibpng"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

libpng License.

> http://www.libpng.org/pub/png/src/libpng-LICENSE.txt

---

##### `LIBPNG_2_0` <a name="construct-hub.SpdxLicense.property.LIBPNG_2_0" id="constructhubspdxlicensepropertylibpng20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

PNG Reference Library version 2.

> http://www.libpng.org/pub/png/src/libpng-LICENSE.txt

---

##### `LIBSELINUX_1_0` <a name="construct-hub.SpdxLicense.property.LIBSELINUX_1_0" id="constructhubspdxlicensepropertylibselinux10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

libselinux public domain notice.

> https://github.com/SELinuxProject/selinux/blob/master/libselinux/LICENSE

---

##### `LIBTIFF` <a name="construct-hub.SpdxLicense.property.LIBTIFF" id="constructhubspdxlicensepropertylibtiff"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

libtiff License.

> https://fedoraproject.org/wiki/Licensing/libtiff

---

##### `LILIQ_P_1_1` <a name="construct-hub.SpdxLicense.property.LILIQ_P_1_1" id="constructhubspdxlicensepropertyliliqp11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Licence Libre du Québec – Permissive version 1.1.

> https://forge.gouv.qc.ca/licence/fr/liliq-v1-1/

---

##### `LILIQ_R_1_1` <a name="construct-hub.SpdxLicense.property.LILIQ_R_1_1" id="constructhubspdxlicensepropertyliliqr11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Licence Libre du Québec – Réciprocité version 1.1.

> https://www.forge.gouv.qc.ca/participez/licence-logicielle/licence-libre-du-quebec-liliq-en-francais/licence-libre-du-quebec-reciprocite-liliq-r-v1-1/

---

##### `LILIQ_RPLUS_1_1` <a name="construct-hub.SpdxLicense.property.LILIQ_RPLUS_1_1" id="constructhubspdxlicensepropertyliliqrplus11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Licence Libre du Québec – Réciprocité forte version 1.1.

> https://www.forge.gouv.qc.ca/participez/licence-logicielle/licence-libre-du-quebec-liliq-en-francais/licence-libre-du-quebec-reciprocite-forte-liliq-r-v1-1/

---

##### `LINUX_OPENIB` <a name="construct-hub.SpdxLicense.property.LINUX_OPENIB" id="constructhubspdxlicensepropertylinuxopenib"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Linux Kernel Variant of OpenIB.org license.

> https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/drivers/infiniband/core/sa.h

---

##### `LPL_1_0` <a name="construct-hub.SpdxLicense.property.LPL_1_0" id="constructhubspdxlicensepropertylpl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Lucent Public License Version 1.0.

> https://opensource.org/licenses/LPL-1.0

---

##### `LPL_1_02` <a name="construct-hub.SpdxLicense.property.LPL_1_02" id="constructhubspdxlicensepropertylpl102"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Lucent Public License v1.02.

> http://plan9.bell-labs.com/plan9/license.html

---

##### `LPPL_1_0` <a name="construct-hub.SpdxLicense.property.LPPL_1_0" id="constructhubspdxlicensepropertylppl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

LaTeX Project Public License v1.0.

> http://www.latex-project.org/lppl/lppl-1-0.txt

---

##### `LPPL_1_1` <a name="construct-hub.SpdxLicense.property.LPPL_1_1" id="constructhubspdxlicensepropertylppl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

LaTeX Project Public License v1.1.

> http://www.latex-project.org/lppl/lppl-1-1.txt

---

##### `LPPL_1_2` <a name="construct-hub.SpdxLicense.property.LPPL_1_2" id="constructhubspdxlicensepropertylppl12"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

LaTeX Project Public License v1.2.

> http://www.latex-project.org/lppl/lppl-1-2.txt

---

##### `LPPL_1_3A` <a name="construct-hub.SpdxLicense.property.LPPL_1_3A" id="constructhubspdxlicensepropertylppl13a"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

LaTeX Project Public License v1.3a.

> http://www.latex-project.org/lppl/lppl-1-3a.txt

---

##### `LPPL_1_3C` <a name="construct-hub.SpdxLicense.property.LPPL_1_3C" id="constructhubspdxlicensepropertylppl13c"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

LaTeX Project Public License v1.3c.

> http://www.latex-project.org/lppl/lppl-1-3c.txt

---

##### `MAKE_INDEX` <a name="construct-hub.SpdxLicense.property.MAKE_INDEX" id="constructhubspdxlicensepropertymakeindex"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

MakeIndex License.

> https://fedoraproject.org/wiki/Licensing/MakeIndex

---

##### `MIR_O_S` <a name="construct-hub.SpdxLicense.property.MIR_O_S" id="constructhubspdxlicensepropertymiros"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

The MirOS Licence.

> https://opensource.org/licenses/MirOS

---

##### `MIT` <a name="construct-hub.SpdxLicense.property.MIT" id="constructhubspdxlicensepropertymit"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

MIT License.

> https://opensource.org/licenses/MIT

---

##### `MIT_0` <a name="construct-hub.SpdxLicense.property.MIT_0" id="constructhubspdxlicensepropertymit0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

MIT No Attribution.

> https://github.com/aws/mit-0

---

##### `MIT_ADVERTISING` <a name="construct-hub.SpdxLicense.property.MIT_ADVERTISING" id="constructhubspdxlicensepropertymitadvertising"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Enlightenment License (e16).

> https://fedoraproject.org/wiki/Licensing/MIT_With_Advertising

---

##### `MIT_CMU` <a name="construct-hub.SpdxLicense.property.MIT_CMU" id="constructhubspdxlicensepropertymitcmu"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

CMU License.

> https://fedoraproject.org/wiki/Licensing:MIT?rd=Licensing/MIT#CMU_Style

---

##### `MIT_ENNA` <a name="construct-hub.SpdxLicense.property.MIT_ENNA" id="constructhubspdxlicensepropertymitenna"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

enna License.

> https://fedoraproject.org/wiki/Licensing/MIT#enna

---

##### `MIT_FEH` <a name="construct-hub.SpdxLicense.property.MIT_FEH" id="constructhubspdxlicensepropertymitfeh"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

feh License.

> https://fedoraproject.org/wiki/Licensing/MIT#feh

---

##### `MIT_OPEN_GROUP` <a name="construct-hub.SpdxLicense.property.MIT_OPEN_GROUP" id="constructhubspdxlicensepropertymitopengroup"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

MIT Open Group variant.

> https://gitlab.freedesktop.org/xorg/app/iceauth/-/blob/master/COPYING

---

##### `MITNFA` <a name="construct-hub.SpdxLicense.property.MITNFA" id="constructhubspdxlicensepropertymitnfa"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

MIT +no-false-attribs license.

> https://fedoraproject.org/wiki/Licensing/MITNFA

---

##### `MOTOSOTO` <a name="construct-hub.SpdxLicense.property.MOTOSOTO" id="constructhubspdxlicensepropertymotosoto"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Motosoto License.

> https://opensource.org/licenses/Motosoto

---

##### `MPICH2` <a name="construct-hub.SpdxLicense.property.MPICH2" id="constructhubspdxlicensepropertympich2"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

mpich2 License.

> https://fedoraproject.org/wiki/Licensing/MIT

---

##### `MPL_1_0` <a name="construct-hub.SpdxLicense.property.MPL_1_0" id="constructhubspdxlicensepropertympl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mozilla Public License 1.0.

> http://www.mozilla.org/MPL/MPL-1.0.html

---

##### `MPL_1_1` <a name="construct-hub.SpdxLicense.property.MPL_1_1" id="constructhubspdxlicensepropertympl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mozilla Public License 1.1.

> http://www.mozilla.org/MPL/MPL-1.1.html

---

##### `MPL_2_0` <a name="construct-hub.SpdxLicense.property.MPL_2_0" id="constructhubspdxlicensepropertympl20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mozilla Public License 2.0.

> http://www.mozilla.org/MPL/2.0/

---

##### `MPL_2_0_NO_COPYLEFT_EXCEPTION` <a name="construct-hub.SpdxLicense.property.MPL_2_0_NO_COPYLEFT_EXCEPTION" id="constructhubspdxlicensepropertympl20nocopyleftexception"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mozilla Public License 2.0 (no copyleft exception).

> http://www.mozilla.org/MPL/2.0/

---

##### `MS_PL` <a name="construct-hub.SpdxLicense.property.MS_PL" id="constructhubspdxlicensepropertymspl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Microsoft Public License.

> http://www.microsoft.com/opensource/licenses.mspx

---

##### `MS_RL` <a name="construct-hub.SpdxLicense.property.MS_RL" id="constructhubspdxlicensepropertymsrl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Microsoft Reciprocal License.

> http://www.microsoft.com/opensource/licenses.mspx

---

##### `MTLL` <a name="construct-hub.SpdxLicense.property.MTLL" id="constructhubspdxlicensepropertymtll"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Matrix Template Library License.

> https://fedoraproject.org/wiki/Licensing/Matrix_Template_Library_License

---

##### `MULANPSL_1_0` <a name="construct-hub.SpdxLicense.property.MULANPSL_1_0" id="constructhubspdxlicensepropertymulanpsl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mulan Permissive Software License, Version 1.

> https://license.coscl.org.cn/MulanPSL/

---

##### `MULANPSL_2_0` <a name="construct-hub.SpdxLicense.property.MULANPSL_2_0" id="constructhubspdxlicensepropertymulanpsl20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mulan Permissive Software License, Version 2.

> https://license.coscl.org.cn/MulanPSL2/

---

##### `MULTICS` <a name="construct-hub.SpdxLicense.property.MULTICS" id="constructhubspdxlicensepropertymultics"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Multics License.

> https://opensource.org/licenses/Multics

---

##### `MUP` <a name="construct-hub.SpdxLicense.property.MUP" id="constructhubspdxlicensepropertymup"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Mup License.

> https://fedoraproject.org/wiki/Licensing/Mup

---

##### `NASA_1_3` <a name="construct-hub.SpdxLicense.property.NASA_1_3" id="constructhubspdxlicensepropertynasa13"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NASA Open Source Agreement 1.3.

> http://ti.arc.nasa.gov/opensource/nosa/

---

##### `NAUMEN` <a name="construct-hub.SpdxLicense.property.NAUMEN" id="constructhubspdxlicensepropertynaumen"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Naumen Public License.

> https://opensource.org/licenses/Naumen

---

##### `NBPL_1_0` <a name="construct-hub.SpdxLicense.property.NBPL_1_0" id="constructhubspdxlicensepropertynbpl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Net Boolean Public License v1.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=37b4b3f6cc4bf34e1d3dec61e69914b9819d8894

---

##### `NCGL_UK_2_0` <a name="construct-hub.SpdxLicense.property.NCGL_UK_2_0" id="constructhubspdxlicensepropertyncgluk20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Non-Commercial Government Licence.

> https://github.com/spdx/license-list-XML/blob/master/src/Apache-2.0.xml

---

##### `NCSA` <a name="construct-hub.SpdxLicense.property.NCSA" id="constructhubspdxlicensepropertyncsa"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

University of Illinois/NCSA Open Source License.

> http://otm.illinois.edu/uiuc_openSource

---

##### `NET_CD_F` <a name="construct-hub.SpdxLicense.property.NET_CD_F" id="constructhubspdxlicensepropertynetcdf"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NetCDF license.

> http://www.unidata.ucar.edu/software/netcdf/copyright.html

---

##### `NET_SNMP` <a name="construct-hub.SpdxLicense.property.NET_SNMP" id="constructhubspdxlicensepropertynetsnmp"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Net-SNMP License.

> http://net-snmp.sourceforge.net/about/license.html

---

##### `NEWSLETR` <a name="construct-hub.SpdxLicense.property.NEWSLETR" id="constructhubspdxlicensepropertynewsletr"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Newsletr License.

> https://fedoraproject.org/wiki/Licensing/Newsletr

---

##### `NGPL` <a name="construct-hub.SpdxLicense.property.NGPL" id="constructhubspdxlicensepropertyngpl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Nethack General Public License.

> https://opensource.org/licenses/NGPL

---

##### `NIST_PD` <a name="construct-hub.SpdxLicense.property.NIST_PD" id="constructhubspdxlicensepropertynistpd"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NIST Public Domain Notice.

> https://github.com/tcheneau/simpleRPL/blob/e645e69e38dd4e3ccfeceb2db8cba05b7c2e0cd3/LICENSE.txt

---

##### `NIST_PD_FALLBACK` <a name="construct-hub.SpdxLicense.property.NIST_PD_FALLBACK" id="constructhubspdxlicensepropertynistpdfallback"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NIST Public Domain Notice with license fallback.

> https://github.com/usnistgov/jsip/blob/59700e6926cbe96c5cdae897d9a7d2656b42abe3/LICENSE

---

##### `NLOD_1_0` <a name="construct-hub.SpdxLicense.property.NLOD_1_0" id="constructhubspdxlicensepropertynlod10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Norwegian Licence for Open Government Data.

> http://data.norge.no/nlod/en/1.0

---

##### `NLPL` <a name="construct-hub.SpdxLicense.property.NLPL" id="constructhubspdxlicensepropertynlpl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

No Limit Public License.

> https://fedoraproject.org/wiki/Licensing/NLPL

---

##### `NOKIA` <a name="construct-hub.SpdxLicense.property.NOKIA" id="constructhubspdxlicensepropertynokia"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Nokia Open Source License.

> https://opensource.org/licenses/nokia

---

##### `NOSL` <a name="construct-hub.SpdxLicense.property.NOSL" id="constructhubspdxlicensepropertynosl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Netizen Open Source License.

> http://bits.netizen.com.au/licenses/NOSL/nosl.txt

---

##### `NOWEB` <a name="construct-hub.SpdxLicense.property.NOWEB" id="constructhubspdxlicensepropertynoweb"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Noweb License.

> https://fedoraproject.org/wiki/Licensing/Noweb

---

##### `NPL_1_0` <a name="construct-hub.SpdxLicense.property.NPL_1_0" id="constructhubspdxlicensepropertynpl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Netscape Public License v1.0.

> http://www.mozilla.org/MPL/NPL/1.0/

---

##### `NPL_1_1` <a name="construct-hub.SpdxLicense.property.NPL_1_1" id="constructhubspdxlicensepropertynpl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Netscape Public License v1.1.

> http://www.mozilla.org/MPL/NPL/1.1/

---

##### `NPOSL_3_0` <a name="construct-hub.SpdxLicense.property.NPOSL_3_0" id="constructhubspdxlicensepropertynposl30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Non-Profit Open Software License 3.0.

> https://opensource.org/licenses/NOSL3.0

---

##### `NRL` <a name="construct-hub.SpdxLicense.property.NRL" id="constructhubspdxlicensepropertynrl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NRL License.

> http://web.mit.edu/network/isakmp/nrllicense.html

---

##### `NTP` <a name="construct-hub.SpdxLicense.property.NTP" id="constructhubspdxlicensepropertyntp"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NTP License.

> https://opensource.org/licenses/NTP

---

##### `NTP_0` <a name="construct-hub.SpdxLicense.property.NTP_0" id="constructhubspdxlicensepropertyntp0"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

NTP No Attribution.

> https://github.com/tytso/e2fsprogs/blob/master/lib/et/et_name.c

---

##### `NUNIT` <a name="construct-hub.SpdxLicense.property.NUNIT" id="constructhubspdxlicensepropertynunit"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Nunit License.

> https://fedoraproject.org/wiki/Licensing/Nunit

---

##### `O_UDA_1_0` <a name="construct-hub.SpdxLicense.property.O_UDA_1_0" id="constructhubspdxlicensepropertyouda10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Use of Data Agreement v1.0.

> https://github.com/microsoft/Open-Use-of-Data-Agreement/blob/v1.0/O-UDA-1.0.md

---

##### `OCCT_PL` <a name="construct-hub.SpdxLicense.property.OCCT_PL" id="constructhubspdxlicensepropertyocctpl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open CASCADE Technology Public License.

> http://www.opencascade.com/content/occt-public-license

---

##### `OCLC_2_0` <a name="construct-hub.SpdxLicense.property.OCLC_2_0" id="constructhubspdxlicensepropertyoclc20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

OCLC Research Public License 2.0.

> http://www.oclc.org/research/activities/software/license/v2final.htm

---

##### `ODBL_1_0` <a name="construct-hub.SpdxLicense.property.ODBL_1_0" id="constructhubspdxlicensepropertyodbl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ODC Open Database License v1.0.

> http://www.opendatacommons.org/licenses/odbl/1.0/

---

##### `ODC_BY_1_0` <a name="construct-hub.SpdxLicense.property.ODC_BY_1_0" id="constructhubspdxlicensepropertyodcby10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Data Commons Attribution License v1.0.

> https://opendatacommons.org/licenses/by/1.0/

---

##### `OFL_1_0` <a name="construct-hub.SpdxLicense.property.OFL_1_0" id="constructhubspdxlicensepropertyofl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SIL Open Font License 1.0.

> http://scripts.sil.org/cms/scripts/page.php?item_id=OFL10_web

---

##### `OFL_1_0_NO_RFN` <a name="construct-hub.SpdxLicense.property.OFL_1_0_NO_RFN" id="constructhubspdxlicensepropertyofl10norfn"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SIL Open Font License 1.0 with no Reserved Font Name.

> http://scripts.sil.org/cms/scripts/page.php?item_id=OFL10_web

---

##### `OFL_1_0_RFN` <a name="construct-hub.SpdxLicense.property.OFL_1_0_RFN" id="constructhubspdxlicensepropertyofl10rfn"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SIL Open Font License 1.0 with Reserved Font Name.

> http://scripts.sil.org/cms/scripts/page.php?item_id=OFL10_web

---

##### `OFL_1_1` <a name="construct-hub.SpdxLicense.property.OFL_1_1" id="constructhubspdxlicensepropertyofl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SIL Open Font License 1.1.

> http://scripts.sil.org/cms/scripts/page.php?item_id=OFL_web

---

##### `OFL_1_1_NO_RFN` <a name="construct-hub.SpdxLicense.property.OFL_1_1_NO_RFN" id="constructhubspdxlicensepropertyofl11norfn"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SIL Open Font License 1.1 with no Reserved Font Name.

> http://scripts.sil.org/cms/scripts/page.php?item_id=OFL_web

---

##### `OFL_1_1_RFN` <a name="construct-hub.SpdxLicense.property.OFL_1_1_RFN" id="constructhubspdxlicensepropertyofl11rfn"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SIL Open Font License 1.1 with Reserved Font Name.

> http://scripts.sil.org/cms/scripts/page.php?item_id=OFL_web

---

##### `OGC_1_0` <a name="construct-hub.SpdxLicense.property.OGC_1_0" id="constructhubspdxlicensepropertyogc10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

OGC Software License, Version 1.0.

> https://www.ogc.org/ogc/software/1.0

---

##### `OGL_CANADA_2_0` <a name="construct-hub.SpdxLicense.property.OGL_CANADA_2_0" id="constructhubspdxlicensepropertyoglcanada20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Government Licence - Canada.

> https://open.canada.ca/en/open-government-licence-canada

---

##### `OGL_UK_1_0` <a name="construct-hub.SpdxLicense.property.OGL_UK_1_0" id="constructhubspdxlicensepropertyogluk10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Government Licence v1.0.

> http://www.nationalarchives.gov.uk/doc/open-government-licence/version/1/

---

##### `OGL_UK_2_0` <a name="construct-hub.SpdxLicense.property.OGL_UK_2_0" id="constructhubspdxlicensepropertyogluk20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Government Licence v2.0.

> http://www.nationalarchives.gov.uk/doc/open-government-licence/version/2/

---

##### `OGL_UK_3_0` <a name="construct-hub.SpdxLicense.property.OGL_UK_3_0" id="constructhubspdxlicensepropertyogluk30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Government Licence v3.0.

> http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

---

##### `OGTSL` <a name="construct-hub.SpdxLicense.property.OGTSL" id="constructhubspdxlicensepropertyogtsl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Group Test Suite License.

> http://www.opengroup.org/testing/downloads/The_Open_Group_TSL.txt

---

##### `OLDAP_1_1` <a name="construct-hub.SpdxLicense.property.OLDAP_1_1" id="constructhubspdxlicensepropertyoldap11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v1.1.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=806557a5ad59804ef3a44d5abfbe91d706b0791f

---

##### `OLDAP_1_2` <a name="construct-hub.SpdxLicense.property.OLDAP_1_2" id="constructhubspdxlicensepropertyoldap12"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v1.2.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=42b0383c50c299977b5893ee695cf4e486fb0dc7

---

##### `OLDAP_1_3` <a name="construct-hub.SpdxLicense.property.OLDAP_1_3" id="constructhubspdxlicensepropertyoldap13"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v1.3.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=e5f8117f0ce088d0bd7a8e18ddf37eaa40eb09b1

---

##### `OLDAP_1_4` <a name="construct-hub.SpdxLicense.property.OLDAP_1_4" id="constructhubspdxlicensepropertyoldap14"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v1.4.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=c9f95c2f3f2ffb5e0ae55fe7388af75547660941

---

##### `OLDAP_2_0` <a name="construct-hub.SpdxLicense.property.OLDAP_2_0" id="constructhubspdxlicensepropertyoldap20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.0 (or possibly 2.0A and 2.0B).

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=cbf50f4e1185a21abd4c0a54d3f4341fe28f36ea

---

##### `OLDAP_2_0_1` <a name="construct-hub.SpdxLicense.property.OLDAP_2_0_1" id="constructhubspdxlicensepropertyoldap201"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.0.1.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=b6d68acd14e51ca3aab4428bf26522aa74873f0e

---

##### `OLDAP_2_1` <a name="construct-hub.SpdxLicense.property.OLDAP_2_1" id="constructhubspdxlicensepropertyoldap21"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.1.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=b0d176738e96a0d3b9f85cb51e140a86f21be715

---

##### `OLDAP_2_2` <a name="construct-hub.SpdxLicense.property.OLDAP_2_2" id="constructhubspdxlicensepropertyoldap22"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.2.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=470b0c18ec67621c85881b2733057fecf4a1acc3

---

##### `OLDAP_2_2_1` <a name="construct-hub.SpdxLicense.property.OLDAP_2_2_1" id="constructhubspdxlicensepropertyoldap221"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.2.1.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=4bc786f34b50aa301be6f5600f58a980070f481e

---

##### `OLDAP_2_2_2` <a name="construct-hub.SpdxLicense.property.OLDAP_2_2_2" id="constructhubspdxlicensepropertyoldap222"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License 2.2.2.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=df2cc1e21eb7c160695f5b7cffd6296c151ba188

---

##### `OLDAP_2_3` <a name="construct-hub.SpdxLicense.property.OLDAP_2_3" id="constructhubspdxlicensepropertyoldap23"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.3.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=d32cf54a32d581ab475d23c810b0a7fbaf8d63c3

---

##### `OLDAP_2_4` <a name="construct-hub.SpdxLicense.property.OLDAP_2_4" id="constructhubspdxlicensepropertyoldap24"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.4.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=cd1284c4a91a8a380d904eee68d1583f989ed386

---

##### `OLDAP_2_5` <a name="construct-hub.SpdxLicense.property.OLDAP_2_5" id="constructhubspdxlicensepropertyoldap25"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.5.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=6852b9d90022e8593c98205413380536b1b5a7cf

---

##### `OLDAP_2_6` <a name="construct-hub.SpdxLicense.property.OLDAP_2_6" id="constructhubspdxlicensepropertyoldap26"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.6.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=1cae062821881f41b73012ba816434897abf4205

---

##### `OLDAP_2_7` <a name="construct-hub.SpdxLicense.property.OLDAP_2_7" id="constructhubspdxlicensepropertyoldap27"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.7.

> http://www.openldap.org/devel/gitweb.cgi?p=openldap.git;a=blob;f=LICENSE;hb=47c2415c1df81556eeb39be6cad458ef87c534a2

---

##### `OLDAP_2_8` <a name="construct-hub.SpdxLicense.property.OLDAP_2_8" id="constructhubspdxlicensepropertyoldap28"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open LDAP Public License v2.8.

> http://www.openldap.org/software/release/license.html

---

##### `OML` <a name="construct-hub.SpdxLicense.property.OML" id="constructhubspdxlicensepropertyoml"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Market License.

> https://fedoraproject.org/wiki/Licensing/Open_Market_License

---

##### `OPEN_SS_L` <a name="construct-hub.SpdxLicense.property.OPEN_SS_L" id="constructhubspdxlicensepropertyopenssl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

OpenSSL License.

> http://www.openssl.org/source/license.html

---

##### `OPL_1_0` <a name="construct-hub.SpdxLicense.property.OPL_1_0" id="constructhubspdxlicensepropertyopl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Public License v1.0.

> http://old.koalateam.com/jackaroo/OPL_1_0.TXT

---

##### `OSET_PL_2_1` <a name="construct-hub.SpdxLicense.property.OSET_PL_2_1" id="constructhubspdxlicensepropertyosetpl21"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

OSET Public License version 2.1.

> http://www.osetfoundation.org/public-license

---

##### `OSL_1_0` <a name="construct-hub.SpdxLicense.property.OSL_1_0" id="constructhubspdxlicensepropertyosl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Software License 1.0.

> https://opensource.org/licenses/OSL-1.0

---

##### `OSL_1_1` <a name="construct-hub.SpdxLicense.property.OSL_1_1" id="constructhubspdxlicensepropertyosl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Software License 1.1.

> https://fedoraproject.org/wiki/Licensing/OSL1.1

---

##### `OSL_2_0` <a name="construct-hub.SpdxLicense.property.OSL_2_0" id="constructhubspdxlicensepropertyosl20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Software License 2.0.

> http://web.archive.org/web/20041020171434/http://www.rosenlaw.com/osl2.0.html

---

##### `OSL_2_1` <a name="construct-hub.SpdxLicense.property.OSL_2_1" id="constructhubspdxlicensepropertyosl21"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Software License 2.1.

> http://web.archive.org/web/20050212003940/http://www.rosenlaw.com/osl21.htm

---

##### `OSL_3_0` <a name="construct-hub.SpdxLicense.property.OSL_3_0" id="constructhubspdxlicensepropertyosl30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Open Software License 3.0.

> https://web.archive.org/web/20120101081418/http://rosenlaw.com:80/OSL3.0.htm

---

##### `PARITY_6_0_0` <a name="construct-hub.SpdxLicense.property.PARITY_6_0_0" id="constructhubspdxlicensepropertyparity600"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

The Parity Public License 6.0.0.

> https://paritylicense.com/versions/6.0.0.html

---

##### `PARITY_7_0_0` <a name="construct-hub.SpdxLicense.property.PARITY_7_0_0" id="constructhubspdxlicensepropertyparity700"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

The Parity Public License 7.0.0.

> https://paritylicense.com/versions/7.0.0.html

---

##### `PDDL_1_0` <a name="construct-hub.SpdxLicense.property.PDDL_1_0" id="constructhubspdxlicensepropertypddl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

ODC Public Domain Dedication & License 1.0.

> http://opendatacommons.org/licenses/pddl/1.0/

---

##### `PHP_3_0` <a name="construct-hub.SpdxLicense.property.PHP_3_0" id="constructhubspdxlicensepropertyphp30"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

PHP License v3.0.

> http://www.php.net/license/3_0.txt

---

##### `PHP_3_01` <a name="construct-hub.SpdxLicense.property.PHP_3_01" id="constructhubspdxlicensepropertyphp301"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

PHP License v3.01.

> http://www.php.net/license/3_01.txt

---

##### `PLEXUS` <a name="construct-hub.SpdxLicense.property.PLEXUS" id="constructhubspdxlicensepropertyplexus"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Plexus Classworlds License.

> https://fedoraproject.org/wiki/Licensing/Plexus_Classworlds_License

---

##### `POLYFORM_NONCOMMERCIAL_1_0_0` <a name="construct-hub.SpdxLicense.property.POLYFORM_NONCOMMERCIAL_1_0_0" id="constructhubspdxlicensepropertypolyformnoncommercial100"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

PolyForm Noncommercial License 1.0.0.

> https://polyformproject.org/licenses/noncommercial/1.0.0

---

##### `POLYFORM_SMALL_BUSINESS_1_0_0` <a name="construct-hub.SpdxLicense.property.POLYFORM_SMALL_BUSINESS_1_0_0" id="constructhubspdxlicensepropertypolyformsmallbusiness100"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

PolyForm Small Business License 1.0.0.

> https://polyformproject.org/licenses/small-business/1.0.0

---

##### `POSTGRE_SQ_L` <a name="construct-hub.SpdxLicense.property.POSTGRE_SQ_L" id="constructhubspdxlicensepropertypostgresql"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

PostgreSQL License.

> http://www.postgresql.org/about/licence

---

##### `PSF_2_0` <a name="construct-hub.SpdxLicense.property.PSF_2_0" id="constructhubspdxlicensepropertypsf20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Python Software Foundation License 2.0.

> https://opensource.org/licenses/Python-2.0

---

##### `PSFRAG` <a name="construct-hub.SpdxLicense.property.PSFRAG" id="constructhubspdxlicensepropertypsfrag"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

psfrag License.

> https://fedoraproject.org/wiki/Licensing/psfrag

---

##### `PSUTILS` <a name="construct-hub.SpdxLicense.property.PSUTILS" id="constructhubspdxlicensepropertypsutils"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

psutils License.

> https://fedoraproject.org/wiki/Licensing/psutils

---

##### `PYTHON_2_0` <a name="construct-hub.SpdxLicense.property.PYTHON_2_0" id="constructhubspdxlicensepropertypython20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Python License 2.0.

> https://opensource.org/licenses/Python-2.0

---

##### `QHULL` <a name="construct-hub.SpdxLicense.property.QHULL" id="constructhubspdxlicensepropertyqhull"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Qhull License.

> https://fedoraproject.org/wiki/Licensing/Qhull

---

##### `QPL_1_0` <a name="construct-hub.SpdxLicense.property.QPL_1_0" id="constructhubspdxlicensepropertyqpl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Q Public License 1.0.

> http://doc.qt.nokia.com/3.3/license.html

---

##### `RDISC` <a name="construct-hub.SpdxLicense.property.RDISC" id="constructhubspdxlicensepropertyrdisc"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Rdisc License.

> https://fedoraproject.org/wiki/Licensing/Rdisc_License

---

##### `RHECOS_1_1` <a name="construct-hub.SpdxLicense.property.RHECOS_1_1" id="constructhubspdxlicensepropertyrhecos11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Red Hat eCos Public License v1.1.

> http://ecos.sourceware.org/old-license.html

---

##### `RPL_1_1` <a name="construct-hub.SpdxLicense.property.RPL_1_1" id="constructhubspdxlicensepropertyrpl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Reciprocal Public License 1.1.

> https://opensource.org/licenses/RPL-1.1

---

##### `RPL_1_5` <a name="construct-hub.SpdxLicense.property.RPL_1_5" id="constructhubspdxlicensepropertyrpl15"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Reciprocal Public License 1.5.

> https://opensource.org/licenses/RPL-1.5

---

##### `RPSL_1_0` <a name="construct-hub.SpdxLicense.property.RPSL_1_0" id="constructhubspdxlicensepropertyrpsl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

RealNetworks Public Source License v1.0.

> https://helixcommunity.org/content/rpsl

---

##### `RSA_MD` <a name="construct-hub.SpdxLicense.property.RSA_MD" id="constructhubspdxlicensepropertyrsamd"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

RSA Message-Digest License.

> http://www.faqs.org/rfcs/rfc1321.html

---

##### `RSCPL` <a name="construct-hub.SpdxLicense.property.RSCPL" id="constructhubspdxlicensepropertyrscpl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Ricoh Source Code Public License.

> http://wayback.archive.org/web/20060715140826/http://www.risource.org/RPL/RPL-1.0A.shtml

---

##### `RUBY` <a name="construct-hub.SpdxLicense.property.RUBY" id="constructhubspdxlicensepropertyruby"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Ruby License.

> http://www.ruby-lang.org/en/LICENSE.txt

---

##### `SAX_PD` <a name="construct-hub.SpdxLicense.property.SAX_PD" id="constructhubspdxlicensepropertysaxpd"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sax Public Domain Notice.

> http://www.saxproject.org/copying.html

---

##### `SAXPATH` <a name="construct-hub.SpdxLicense.property.SAXPATH" id="constructhubspdxlicensepropertysaxpath"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Saxpath License.

> https://fedoraproject.org/wiki/Licensing/Saxpath_License

---

##### `SCEA` <a name="construct-hub.SpdxLicense.property.SCEA" id="constructhubspdxlicensepropertyscea"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SCEA Shared Source License.

> http://research.scea.com/scea_shared_source_license.html

---

##### `SENDMAIL` <a name="construct-hub.SpdxLicense.property.SENDMAIL" id="constructhubspdxlicensepropertysendmail"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sendmail License.

> http://www.sendmail.com/pdfs/open_source/sendmail_license.pdf

---

##### `SENDMAIL_8_23` <a name="construct-hub.SpdxLicense.property.SENDMAIL_8_23" id="constructhubspdxlicensepropertysendmail823"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sendmail License 8.23.

> https://www.proofpoint.com/sites/default/files/sendmail-license.pdf

---

##### `SGI_B_1_0` <a name="construct-hub.SpdxLicense.property.SGI_B_1_0" id="constructhubspdxlicensepropertysgib10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SGI Free Software License B v1.0.

> http://oss.sgi.com/projects/FreeB/SGIFreeSWLicB.1.0.html

---

##### `SGI_B_1_1` <a name="construct-hub.SpdxLicense.property.SGI_B_1_1" id="constructhubspdxlicensepropertysgib11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SGI Free Software License B v1.1.

> http://oss.sgi.com/projects/FreeB/

---

##### `SGI_B_2_0` <a name="construct-hub.SpdxLicense.property.SGI_B_2_0" id="constructhubspdxlicensepropertysgib20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SGI Free Software License B v2.0.

> http://oss.sgi.com/projects/FreeB/SGIFreeSWLicB.2.0.pdf

---

##### `SHL_0_5` <a name="construct-hub.SpdxLicense.property.SHL_0_5" id="constructhubspdxlicensepropertyshl05"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Solderpad Hardware License v0.5.

> https://solderpad.org/licenses/SHL-0.5/

---

##### `SHL_0_51` <a name="construct-hub.SpdxLicense.property.SHL_0_51" id="constructhubspdxlicensepropertyshl051"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Solderpad Hardware License, Version 0.51.

> https://solderpad.org/licenses/SHL-0.51/

---

##### `SIMPL_2_0` <a name="construct-hub.SpdxLicense.property.SIMPL_2_0" id="constructhubspdxlicensepropertysimpl20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Simple Public License 2.0.

> https://opensource.org/licenses/SimPL-2.0

---

##### `SISSL` <a name="construct-hub.SpdxLicense.property.SISSL" id="constructhubspdxlicensepropertysissl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sun Industry Standards Source License v1.1.

> http://www.openoffice.org/licenses/sissl_license.html

---

##### `SISSL_1_2` <a name="construct-hub.SpdxLicense.property.SISSL_1_2" id="constructhubspdxlicensepropertysissl12"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sun Industry Standards Source License v1.2.

> http://gridscheduler.sourceforge.net/Gridengine_SISSL_license.html

---

##### `SLEEPYCAT` <a name="construct-hub.SpdxLicense.property.SLEEPYCAT" id="constructhubspdxlicensepropertysleepycat"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sleepycat License.

> https://opensource.org/licenses/Sleepycat

---

##### `SMLNJ` <a name="construct-hub.SpdxLicense.property.SMLNJ" id="constructhubspdxlicensepropertysmlnj"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Standard ML of New Jersey License.

> https://www.smlnj.org/license.html

---

##### `SMPPL` <a name="construct-hub.SpdxLicense.property.SMPPL" id="constructhubspdxlicensepropertysmppl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Secure Messaging Protocol Public License.

> https://github.com/dcblake/SMP/blob/master/Documentation/License.txt

---

##### `SNIA` <a name="construct-hub.SpdxLicense.property.SNIA" id="constructhubspdxlicensepropertysnia"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SNIA Public License 1.1.

> https://fedoraproject.org/wiki/Licensing/SNIA_Public_License

---

##### `SPENCER_86` <a name="construct-hub.SpdxLicense.property.SPENCER_86" id="constructhubspdxlicensepropertyspencer86"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Spencer License 86.

> https://fedoraproject.org/wiki/Licensing/Henry_Spencer_Reg-Ex_Library_License

---

##### `SPENCER_94` <a name="construct-hub.SpdxLicense.property.SPENCER_94" id="constructhubspdxlicensepropertyspencer94"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Spencer License 94.

> https://fedoraproject.org/wiki/Licensing/Henry_Spencer_Reg-Ex_Library_License

---

##### `SPENCER_99` <a name="construct-hub.SpdxLicense.property.SPENCER_99" id="constructhubspdxlicensepropertyspencer99"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Spencer License 99.

> http://www.opensource.apple.com/source/tcl/tcl-5/tcl/generic/regfronts.c

---

##### `SPL_1_0` <a name="construct-hub.SpdxLicense.property.SPL_1_0" id="constructhubspdxlicensepropertyspl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sun Public License v1.0.

> https://opensource.org/licenses/SPL-1.0

---

##### `SSH_OPENSSH` <a name="construct-hub.SpdxLicense.property.SSH_OPENSSH" id="constructhubspdxlicensepropertysshopenssh"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SSH OpenSSH license.

> https://github.com/openssh/openssh-portable/blob/1b11ea7c58cd5c59838b5fa574cd456d6047b2d4/LICENCE#L10

---

##### `SSH_SHORT` <a name="construct-hub.SpdxLicense.property.SSH_SHORT" id="constructhubspdxlicensepropertysshshort"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SSH short notice.

> https://github.com/openssh/openssh-portable/blob/1b11ea7c58cd5c59838b5fa574cd456d6047b2d4/pathnames.h

---

##### `SSPL_1_0` <a name="construct-hub.SpdxLicense.property.SSPL_1_0" id="constructhubspdxlicensepropertysspl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Server Side Public License, v 1.

> https://www.mongodb.com/licensing/server-side-public-license

---

##### `STANDARDML_NJ` <a name="construct-hub.SpdxLicense.property.STANDARDML_NJ" id="constructhubspdxlicensepropertystandardmlnj"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Standard ML of New Jersey License.

> http://www.smlnj.org//license.html

---

##### `SUGARCRM_1_1_3` <a name="construct-hub.SpdxLicense.property.SUGARCRM_1_1_3" id="constructhubspdxlicensepropertysugarcrm113"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

SugarCRM Public License v1.1.3.

> http://www.sugarcrm.com/crm/SPL

---

##### `SWL` <a name="construct-hub.SpdxLicense.property.SWL" id="constructhubspdxlicensepropertyswl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Scheme Widget Library (SWL) Software License Agreement.

> https://fedoraproject.org/wiki/Licensing/SWL

---

##### `TAPR_OHL_1_0` <a name="construct-hub.SpdxLicense.property.TAPR_OHL_1_0" id="constructhubspdxlicensepropertytaprohl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

TAPR Open Hardware License v1.0.

> https://www.tapr.org/OHL

---

##### `TCL` <a name="construct-hub.SpdxLicense.property.TCL" id="constructhubspdxlicensepropertytcl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

TCL/TK License.

> http://www.tcl.tk/software/tcltk/license.html

---

##### `TCP_WRAPPERS` <a name="construct-hub.SpdxLicense.property.TCP_WRAPPERS" id="constructhubspdxlicensepropertytcpwrappers"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

TCP Wrappers License.

> http://rc.quest.com/topics/openssh/license.php#tcpwrappers

---

##### `TMATE` <a name="construct-hub.SpdxLicense.property.TMATE" id="constructhubspdxlicensepropertytmate"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

TMate Open Source License.

> http://svnkit.com/license.html

---

##### `TORQUE_1_1` <a name="construct-hub.SpdxLicense.property.TORQUE_1_1" id="constructhubspdxlicensepropertytorque11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

TORQUE v2.5+ Software License v1.1.

> https://fedoraproject.org/wiki/Licensing/TORQUEv1.1

---

##### `TOSL` <a name="construct-hub.SpdxLicense.property.TOSL" id="constructhubspdxlicensepropertytosl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Trusster Open Source License.

> https://fedoraproject.org/wiki/Licensing/TOSL

---

##### `TU_BERLIN_1_0` <a name="construct-hub.SpdxLicense.property.TU_BERLIN_1_0" id="constructhubspdxlicensepropertytuberlin10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Technische Universitaet Berlin License 1.0.

> https://github.com/swh/ladspa/blob/7bf6f3799fdba70fda297c2d8fd9f526803d9680/gsm/COPYRIGHT

---

##### `TU_BERLIN_2_0` <a name="construct-hub.SpdxLicense.property.TU_BERLIN_2_0" id="constructhubspdxlicensepropertytuberlin20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Technische Universitaet Berlin License 2.0.

> https://github.com/CorsixTH/deps/blob/fd339a9f526d1d9c9f01ccf39e438a015da50035/licences/libgsm.txt

---

##### `UCL_1_0` <a name="construct-hub.SpdxLicense.property.UCL_1_0" id="constructhubspdxlicensepropertyucl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Upstream Compatibility License v1.0.

> https://opensource.org/licenses/UCL-1.0

---

##### `UNICODE_DFS_2015` <a name="construct-hub.SpdxLicense.property.UNICODE_DFS_2015" id="constructhubspdxlicensepropertyunicodedfs2015"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Unicode License Agreement - Data Files and Software (2015).

> https://web.archive.org/web/20151224134844/http://unicode.org/copyright.html

---

##### `UNICODE_DFS_2016` <a name="construct-hub.SpdxLicense.property.UNICODE_DFS_2016" id="constructhubspdxlicensepropertyunicodedfs2016"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Unicode License Agreement - Data Files and Software (2016).

> http://www.unicode.org/copyright.html

---

##### `UNICODE_TOU` <a name="construct-hub.SpdxLicense.property.UNICODE_TOU" id="constructhubspdxlicensepropertyunicodetou"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Unicode Terms of Use.

> http://www.unicode.org/copyright.html

---

##### `UNLICENSE` <a name="construct-hub.SpdxLicense.property.UNLICENSE" id="constructhubspdxlicensepropertyunlicense"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

The Unlicense.

> https://unlicense.org/

---

##### `UNLICENSED` <a name="construct-hub.SpdxLicense.property.UNLICENSED" id="constructhubspdxlicensepropertyunlicensed"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Packages that have not been licensed.

---

##### `UPL_1_0` <a name="construct-hub.SpdxLicense.property.UPL_1_0" id="constructhubspdxlicensepropertyupl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Universal Permissive License v1.0.

> https://opensource.org/licenses/UPL

---

##### `VIM` <a name="construct-hub.SpdxLicense.property.VIM" id="constructhubspdxlicensepropertyvim"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Vim License.

> http://vimdoc.sourceforge.net/htmldoc/uganda.html

---

##### `VOSTROM` <a name="construct-hub.SpdxLicense.property.VOSTROM" id="constructhubspdxlicensepropertyvostrom"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

VOSTROM Public License for Open Source.

> https://fedoraproject.org/wiki/Licensing/VOSTROM

---

##### `VSL_1_0` <a name="construct-hub.SpdxLicense.property.VSL_1_0" id="constructhubspdxlicensepropertyvsl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Vovida Software License v1.0.

> https://opensource.org/licenses/VSL-1.0

---

##### `W3_C` <a name="construct-hub.SpdxLicense.property.W3_C" id="constructhubspdxlicensepropertyw3c"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

W3C Software Notice and License (2002-12-31).

> http://www.w3.org/Consortium/Legal/2002/copyright-software-20021231.html

---

##### `W3C_19980720` <a name="construct-hub.SpdxLicense.property.W3C_19980720" id="constructhubspdxlicensepropertyw3c19980720"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

W3C Software Notice and License (1998-07-20).

> http://www.w3.org/Consortium/Legal/copyright-software-19980720.html

---

##### `W3C_20150513` <a name="construct-hub.SpdxLicense.property.W3C_20150513" id="constructhubspdxlicensepropertyw3c20150513"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

W3C Software Notice and Document License (2015-05-13).

> https://www.w3.org/Consortium/Legal/2015/copyright-software-and-document

---

##### `WATCOM_1_0` <a name="construct-hub.SpdxLicense.property.WATCOM_1_0" id="constructhubspdxlicensepropertywatcom10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Sybase Open Watcom Public License 1.0.

> https://opensource.org/licenses/Watcom-1.0

---

##### `WSUIPA` <a name="construct-hub.SpdxLicense.property.WSUIPA" id="constructhubspdxlicensepropertywsuipa"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Wsuipa License.

> https://fedoraproject.org/wiki/Licensing/Wsuipa

---

##### `WTFPL` <a name="construct-hub.SpdxLicense.property.WTFPL" id="constructhubspdxlicensepropertywtfpl"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Do What The F*ck You Want To Public License.

> http://www.wtfpl.net/about/

---

##### `WX_WINDOWS` <a name="construct-hub.SpdxLicense.property.WX_WINDOWS" id="constructhubspdxlicensepropertywxwindows"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

wxWindows Library License.

> https://opensource.org/licenses/WXwindows

---

##### `X11` <a name="construct-hub.SpdxLicense.property.X11" id="constructhubspdxlicensepropertyx11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

X11 License.

> http://www.xfree86.org/3.3.6/COPYRIGHT2.html#3

---

##### `XEROX` <a name="construct-hub.SpdxLicense.property.XEROX" id="constructhubspdxlicensepropertyxerox"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Xerox License.

> https://fedoraproject.org/wiki/Licensing/Xerox

---

##### `XFREE86_1_1` <a name="construct-hub.SpdxLicense.property.XFREE86_1_1" id="constructhubspdxlicensepropertyxfree8611"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

XFree86 License 1.1.

> http://www.xfree86.org/current/LICENSE4.html

---

##### `XINETD` <a name="construct-hub.SpdxLicense.property.XINETD" id="constructhubspdxlicensepropertyxinetd"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

xinetd License.

> https://fedoraproject.org/wiki/Licensing/Xinetd_License

---

##### `XNET` <a name="construct-hub.SpdxLicense.property.XNET" id="constructhubspdxlicensepropertyxnet"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

X.Net License.

> https://opensource.org/licenses/Xnet

---

##### `XPP` <a name="construct-hub.SpdxLicense.property.XPP" id="constructhubspdxlicensepropertyxpp"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

XPP License.

> https://fedoraproject.org/wiki/Licensing/xpp

---

##### `XSKAT` <a name="construct-hub.SpdxLicense.property.XSKAT" id="constructhubspdxlicensepropertyxskat"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

XSkat License.

> https://fedoraproject.org/wiki/Licensing/XSkat_License

---

##### `YPL_1_0` <a name="construct-hub.SpdxLicense.property.YPL_1_0" id="constructhubspdxlicensepropertyypl10"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Yahoo!

Public License v1.0

> http://www.zimbra.com/license/yahoo_public_license_1.0.html

---

##### `YPL_1_1` <a name="construct-hub.SpdxLicense.property.YPL_1_1" id="constructhubspdxlicensepropertyypl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Yahoo!

Public License v1.1

> http://www.zimbra.com/license/yahoo_public_license_1.1.html

---

##### `ZED` <a name="construct-hub.SpdxLicense.property.ZED" id="constructhubspdxlicensepropertyzed"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zed License.

> https://fedoraproject.org/wiki/Licensing/Zed

---

##### `ZEND_2_0` <a name="construct-hub.SpdxLicense.property.ZEND_2_0" id="constructhubspdxlicensepropertyzend20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zend License v2.0.

> https://web.archive.org/web/20130517195954/http://www.zend.com/license/2_00.txt

---

##### `ZERO_BSD` <a name="construct-hub.SpdxLicense.property.ZERO_BSD" id="constructhubspdxlicensepropertyzerobsd"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

BSD Zero Clause License.

> http://landley.net/toybox/license.html

---

##### `ZIMBRA_1_3` <a name="construct-hub.SpdxLicense.property.ZIMBRA_1_3" id="constructhubspdxlicensepropertyzimbra13"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zimbra Public License v1.3.

> http://web.archive.org/web/20100302225219/http://www.zimbra.com/license/zimbra-public-license-1-3.html

---

##### `ZIMBRA_1_4` <a name="construct-hub.SpdxLicense.property.ZIMBRA_1_4" id="constructhubspdxlicensepropertyzimbra14"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zimbra Public License v1.4.

> http://www.zimbra.com/legal/zimbra-public-license-1-4

---

##### `ZLIB` <a name="construct-hub.SpdxLicense.property.ZLIB" id="constructhubspdxlicensepropertyzlib"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

zlib License.

> http://www.zlib.net/zlib_license.html

---

##### `ZLIB_ACKNOWLEDGEMENT` <a name="construct-hub.SpdxLicense.property.ZLIB_ACKNOWLEDGEMENT" id="constructhubspdxlicensepropertyzlibacknowledgement"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

zlib/libpng License with Acknowledgement.

> https://fedoraproject.org/wiki/Licensing/ZlibWithAcknowledgement

---

##### `ZPL_1_1` <a name="construct-hub.SpdxLicense.property.ZPL_1_1" id="constructhubspdxlicensepropertyzpl11"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zope Public License 1.1.

> http://old.zope.org/Resources/License/ZPL-1.1

---

##### `ZPL_2_0` <a name="construct-hub.SpdxLicense.property.ZPL_2_0" id="constructhubspdxlicensepropertyzpl20"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zope Public License 2.0.

> http://old.zope.org/Resources/License/ZPL-2.0

---

##### `ZPL_2_1` <a name="construct-hub.SpdxLicense.property.ZPL_2_1" id="constructhubspdxlicensepropertyzpl21"></a>

- *Type:* [`construct-hub.SpdxLicense`](#construct-hub.SpdxLicense)

Zope Public License 2.1.

> http://old.zope.org/Resources/ZPL/

---

### TagCondition <a name="construct-hub.TagCondition" id="constructhubtagcondition"></a>

Condition for applying a custom tag to a package.

#### Initializers <a name="construct-hub.TagCondition.Initializer" id="constructhubtagconditioninitializer"></a>

```typescript
import { TagCondition } from 'construct-hub'

new TagCondition()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---

#### Methods <a name="Methods" id="methods"></a>

| **Name** | **Description** |
| --- | --- |
| [`bind`](#constructhubtagconditionbind) | *No description.* |

---

##### `bind` <a name="construct-hub.TagCondition.bind" id="constructhubtagconditionbind"></a>

```typescript
public bind()
```

#### Static Functions <a name="Static Functions" id="static-functions"></a>

| **Name** | **Description** |
| --- | --- |
| [`and`](#constructhubtagconditionand) | Create an && condition which applies only when all condition arguments are true. |
| [`field`](#constructhubtagconditionfield) | Target a field within the `package.json` to assert against. Nested fields can be accessed by passing multiple keys. `TagCondition.field('key1', 'key2')` will access `packageJson?.key1?.key2`. |
| [`not`](#constructhubtagconditionnot) | Create a ! |
| [`or`](#constructhubtagconditionor) | Create an \|\| condition which applies if any of the condition arguments are true. |

---

##### `and` <a name="construct-hub.TagCondition.and" id="constructhubtagconditionand"></a>

```typescript
import { TagCondition } from 'construct-hub'

TagCondition.and(conds: TagCondition)
```

###### `conds`<sup>Required</sup> <a name="construct-hub.TagCondition.parameter.conds" id="constructhubtagconditionparameterconds"></a>

- *Type:* [`construct-hub.TagCondition`](#construct-hub.TagCondition)

---

##### `field` <a name="construct-hub.TagCondition.field" id="constructhubtagconditionfield"></a>

```typescript
import { TagCondition } from 'construct-hub'

TagCondition.field(keys: string)
```

###### `keys`<sup>Required</sup> <a name="construct-hub.TagCondition.parameter.keys" id="constructhubtagconditionparameterkeys"></a>

- *Type:* `string`

---

##### `not` <a name="construct-hub.TagCondition.not" id="constructhubtagconditionnot"></a>

```typescript
import { TagCondition } from 'construct-hub'

TagCondition.not(conds: TagCondition)
```

###### `conds`<sup>Required</sup> <a name="construct-hub.TagCondition.parameter.conds" id="constructhubtagconditionparameterconds"></a>

- *Type:* [`construct-hub.TagCondition`](#construct-hub.TagCondition)

---

##### `or` <a name="construct-hub.TagCondition.or" id="constructhubtagconditionor"></a>

```typescript
import { TagCondition } from 'construct-hub'

TagCondition.or(conds: TagCondition)
```

###### `conds`<sup>Required</sup> <a name="construct-hub.TagCondition.parameter.conds" id="constructhubtagconditionparameterconds"></a>

- *Type:* [`construct-hub.TagCondition`](#construct-hub.TagCondition)

---



### TagConditionField <a name="construct-hub.TagConditionField" id="constructhubtagconditionfield"></a>

Target a field to use in logic to dictate whether a tag is relevant.

#### Initializers <a name="construct-hub.TagConditionField.Initializer" id="constructhubtagconditionfieldinitializer"></a>

```typescript
import { TagConditionField } from 'construct-hub'

new TagConditionField(field: string[])
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| [`field`](#constructhubtagconditionfieldparameterfield)<span title="Required">*</span> | `string`[] | *No description.* |

---

##### `field`<sup>Required</sup> <a name="construct-hub.TagConditionField.parameter.field" id="constructhubtagconditionfieldparameterfield"></a>

- *Type:* `string`[]

---

#### Methods <a name="Methods" id="methods"></a>

| **Name** | **Description** |
| --- | --- |
| [`eq`](#constructhubtagconditionfieldeq) | Create a === condition which applies if the specified field within the package's package.json is equal to the passed value. |
| [`includes`](#constructhubtagconditionfieldincludes) | Create a `field.includes(value)` condition which applies if the specified field within the package's package.json includes the value. This works for arrays or strings. |
| [`startsWith`](#constructhubtagconditionfieldstartswith) | Create a `field.startsWith(value)` condition which applies if the specified field within the package's package.json begins with the value. This works only for string values. |

---

##### `eq` <a name="construct-hub.TagConditionField.eq" id="constructhubtagconditionfieldeq"></a>

```typescript
public eq(value: any)
```

###### `value`<sup>Required</sup> <a name="construct-hub.TagConditionField.parameter.value" id="constructhubtagconditionfieldparametervalue"></a>

- *Type:* `any`

---

##### `includes` <a name="construct-hub.TagConditionField.includes" id="constructhubtagconditionfieldincludes"></a>

```typescript
public includes(value: any)
```

###### `value`<sup>Required</sup> <a name="construct-hub.TagConditionField.parameter.value" id="constructhubtagconditionfieldparametervalue"></a>

- *Type:* `any`

---

##### `startsWith` <a name="construct-hub.TagConditionField.startsWith" id="constructhubtagconditionfieldstartswith"></a>

```typescript
public startsWith(value: string)
```

###### `value`<sup>Required</sup> <a name="construct-hub.TagConditionField.parameter.value" id="constructhubtagconditionfieldparametervalue"></a>

- *Type:* `string`

---




## Protocols <a name="Protocols" id="protocols"></a>

### IDenyList <a name="construct-hub.IDenyList" id="constructhubidenylist"></a>

- *Implemented By:* [`construct-hub.IDenyList`](#construct-hub.IDenyList)

DenyList features exposed to extension points.

#### Methods <a name="Methods" id="methods"></a>

| **Name** | **Description** |
| --- | --- |
| [`grantRead`](#constructhubidenylistgrantread) | Grants an AWS Lambda function permissions to read the deny list, and adds the relevant environment variables expected by the `DenyListClient`. |

---

##### `grantRead` <a name="construct-hub.IDenyList.grantRead" id="constructhubidenylistgrantread"></a>

```typescript
public grantRead(handler: Function)
```

###### `handler`<sup>Required</sup> <a name="construct-hub.IDenyList.parameter.handler" id="constructhubidenylistparameterhandler"></a>

- *Type:* [`@aws-cdk/aws-lambda.Function`](#@aws-cdk/aws-lambda.Function)

---


### ILicenseList <a name="construct-hub.ILicenseList" id="constructhubilicenselist"></a>

- *Implemented By:* [`construct-hub.ILicenseList`](#construct-hub.ILicenseList)

#### Methods <a name="Methods" id="methods"></a>

| **Name** | **Description** |
| --- | --- |
| [`grantRead`](#constructhubilicenselistgrantread) | Grants an AWS Lambda function permissions to read the license allow list, and adds the relevant environment variables expected by the `LicenseListClient`. |

---

##### `grantRead` <a name="construct-hub.ILicenseList.grantRead" id="constructhubilicenselistgrantread"></a>

```typescript
public grantRead(handler: Function)
```

###### `handler`<sup>Required</sup> <a name="construct-hub.ILicenseList.parameter.handler" id="constructhubilicenselistparameterhandler"></a>

- *Type:* [`@aws-cdk/aws-lambda.Function`](#@aws-cdk/aws-lambda.Function)

---


### IMonitoring <a name="construct-hub.IMonitoring" id="constructhubimonitoring"></a>

- *Implemented By:* [`construct-hub.IMonitoring`](#construct-hub.IMonitoring)

ConstructHub monitoring features exposed to extension points.

#### Methods <a name="Methods" id="methods"></a>

| **Name** | **Description** |
| --- | --- |
| [`addHighSeverityAlarm`](#constructhubimonitoringaddhighseverityalarm) | Adds a high-severity alarm. |
| [`addLowSeverityAlarm`](#constructhubimonitoringaddlowseverityalarm) | Adds a low-severity alarm. |

---

##### `addHighSeverityAlarm` <a name="construct-hub.IMonitoring.addHighSeverityAlarm" id="constructhubimonitoringaddhighseverityalarm"></a>

```typescript
public addHighSeverityAlarm(title: string, alarm: Alarm)
```

###### `title`<sup>Required</sup> <a name="construct-hub.IMonitoring.parameter.title" id="constructhubimonitoringparametertitle"></a>

- *Type:* `string`

a user-friendly title for the alarm (will be rendered on the high-severity CloudWatch dashboard).

---

###### `alarm`<sup>Required</sup> <a name="construct-hub.IMonitoring.parameter.alarm" id="constructhubimonitoringparameteralarm"></a>

- *Type:* [`@aws-cdk/aws-cloudwatch.Alarm`](#@aws-cdk/aws-cloudwatch.Alarm)

the alarm to be added to the high-severity dashboard.

---

##### `addLowSeverityAlarm` <a name="construct-hub.IMonitoring.addLowSeverityAlarm" id="constructhubimonitoringaddlowseverityalarm"></a>

```typescript
public addLowSeverityAlarm(title: string, alarm: Alarm)
```

###### `title`<sup>Required</sup> <a name="construct-hub.IMonitoring.parameter.title" id="constructhubimonitoringparametertitle"></a>

- *Type:* `string`

a user-friendly title for the alarm (not currently used).

---

###### `alarm`<sup>Required</sup> <a name="construct-hub.IMonitoring.parameter.alarm" id="constructhubimonitoringparameteralarm"></a>

- *Type:* [`@aws-cdk/aws-cloudwatch.Alarm`](#@aws-cdk/aws-cloudwatch.Alarm)

the alarm to be added.

---


### IPackageSource <a name="construct-hub.IPackageSource" id="constructhubipackagesource"></a>

- *Implemented By:* [`construct-hub.sources.CodeArtifact`](#construct-hub.sources.CodeArtifact), [`construct-hub.sources.NpmJs`](#construct-hub.sources.NpmJs), [`construct-hub.IPackageSource`](#construct-hub.IPackageSource)

A package source for ConstructHub.

#### Methods <a name="Methods" id="methods"></a>

| **Name** | **Description** |
| --- | --- |
| [`bind`](#constructhubipackagesourcebind) | Binds the package source to a scope and target queue. |

---

##### `bind` <a name="construct-hub.IPackageSource.bind" id="constructhubipackagesourcebind"></a>

```typescript
public bind(scope: Construct, opts: PackageSourceBindOptions)
```

###### `scope`<sup>Required</sup> <a name="construct-hub.IPackageSource.parameter.scope" id="constructhubipackagesourceparameterscope"></a>

- *Type:* [`@aws-cdk/core.Construct`](#@aws-cdk/core.Construct)

the construct scope in which the binding happens.

---

###### `opts`<sup>Required</sup> <a name="construct-hub.IPackageSource.parameter.opts" id="constructhubipackagesourceparameteropts"></a>

- *Type:* [`construct-hub.PackageSourceBindOptions`](#construct-hub.PackageSourceBindOptions)

options for binding the package source.

---


### IRepository <a name="construct-hub.IRepository" id="constructhubirepository"></a>

- *Implemented By:* [`construct-hub.IRepository`](#construct-hub.IRepository)

The CodeArtifact repository API exposed to extensions.

#### Methods <a name="Methods" id="methods"></a>

| **Name** | **Description** |
| --- | --- |
| [`addExternalConnection`](#constructhubirepositoryaddexternalconnection) | Adds an external connection to this repository. |

---

##### `addExternalConnection` <a name="construct-hub.IRepository.addExternalConnection" id="constructhubirepositoryaddexternalconnection"></a>

```typescript
public addExternalConnection(id: string)
```

###### `id`<sup>Required</sup> <a name="construct-hub.IRepository.parameter.id" id="constructhubirepositoryparameterid"></a>

- *Type:* `string`

the id of the external connection (i.e: `public:npmjs`).

---


## Enums <a name="Enums" id="enums"></a>

### Isolation <a name="Isolation" id="isolation"></a>

| **Name** | **Description** |
| --- | --- |
| [`UNLIMITED_INTERNET_ACCESS`](#constructhubisolationunlimitedinternetaccess) | No isolation is done whatsoever. The doc-generation process still is provisioned with least-privilege permissions, but retains complete access to internet. |
| [`LIMITED_INTERNET_ACCESS`](#constructhubisolationlimitedinternetaccess) | The same protections as `UNLIMITED_INTERNET_ACCESS`, except outbound internet connections are limited to IP address ranges corresponding to hosting endpoints for npmjs.com. |
| [`NO_INTERNET_ACCESS`](#constructhubisolationnointernetaccess) | The same protections as `LIMITED_INTERNET_ACCESS`, except all remaining internet access is removed. |

---

How possibly risky operations (such as doc-generation, which requires installing the indexed packages in order to trans-literate sample code) are isolated to mitigate possible arbitrary code execution vulnerabilities in and around `npm install` or the transliterator's use of the TypeScript compiler.

#### `UNLIMITED_INTERNET_ACCESS` <a name="construct-hub.Isolation.UNLIMITED_INTERNET_ACCESS" id="constructhubisolationunlimitedinternetaccess"></a>

No isolation is done whatsoever. The doc-generation process still is provisioned with least-privilege permissions, but retains complete access to internet.

While this maximizes the chances of successfully installing packages (and hence successfully generating documentation for those), it is also the least secure mode of operation.  We advise you only consider using this isolation mode if you are hosting a ConstructHub instance that only indexes trusted packages (including transitive dependencies).

---


#### `LIMITED_INTERNET_ACCESS` <a name="construct-hub.Isolation.LIMITED_INTERNET_ACCESS" id="constructhubisolationlimitedinternetaccess"></a>

The same protections as `UNLIMITED_INTERNET_ACCESS`, except outbound internet connections are limited to IP address ranges corresponding to hosting endpoints for npmjs.com.

---


#### `NO_INTERNET_ACCESS` <a name="construct-hub.Isolation.NO_INTERNET_ACCESS" id="constructhubisolationnointernetaccess"></a>

The same protections as `LIMITED_INTERNET_ACCESS`, except all remaining internet access is removed.

All traffic to AWS service endpoints is routed through VPC Endpoints, as the compute nodes are jailed in a completely isolated VPC.  This is the most secure (and recommended) mode of operation for ConstructHub instances.

---


### TagConditionLogicType <a name="TagConditionLogicType" id="tagconditionlogictype"></a>

| **Name** | **Description** |
| --- | --- |
| [`AND`](#constructhubtagconditionlogictypeand) | *No description.* |
| [`OR`](#constructhubtagconditionlogictypeor) | *No description.* |
| [`NOT`](#constructhubtagconditionlogictypenot) | *No description.* |
| [`EQUALS`](#constructhubtagconditionlogictypeequals) | *No description.* |
| [`INCLUDES`](#constructhubtagconditionlogictypeincludes) | *No description.* |
| [`STARTS_WITH`](#constructhubtagconditionlogictypestartswith) | *No description.* |

---

Logic operators for performing specific conditional logic.

#### `AND` <a name="construct-hub.TagConditionLogicType.AND" id="constructhubtagconditionlogictypeand"></a>

---


#### `OR` <a name="construct-hub.TagConditionLogicType.OR" id="constructhubtagconditionlogictypeor"></a>

---


#### `NOT` <a name="construct-hub.TagConditionLogicType.NOT" id="constructhubtagconditionlogictypenot"></a>

---


#### `EQUALS` <a name="construct-hub.TagConditionLogicType.EQUALS" id="constructhubtagconditionlogictypeequals"></a>

---


#### `INCLUDES` <a name="construct-hub.TagConditionLogicType.INCLUDES" id="constructhubtagconditionlogictypeincludes"></a>

---


#### `STARTS_WITH` <a name="construct-hub.TagConditionLogicType.STARTS_WITH" id="constructhubtagconditionlogictypestartswith"></a>

---

