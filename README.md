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
> The [public instance of ConstructHub](https://constructs.dev) is Generally Available.
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

### Personalization

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

By default, download counts of NPM packages will be fetched periodically from
NPM's public API by a Lambda. Since this is not desirable if you are using a
private package registry, this is automatically disabled if you specify your own
value for `packageSources`. (But this can be re-enabled through the
`fetchPackageStats` property if needed).

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

#### Redirecting from additional domains

You can add additional domains that will be redirected to your primary Construct
Hub domain:

```ts
import * as r53 from '@aws-cdk/aws-route53';

const myDomainZone = r53.HostedZone.fromHostedZoneAttributes(this, 'MyDomainZone', {
  hostedZoneId: 'AZ1234',
  zoneName: 'my.domain.com',
});

new ConstructHub(this, 'ConstructHub', {
  additionalDomains: [ { hostedZone: myDomainZone } ]
});
```

This will set up full domain redirect using Amazon S3 and Amazon CloudFront. All
requests will be redirected to your primary Construct Hub domain.

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

1. [Application Overview](./docs/application-overview.md) provides a high-level
   description of the components that make a ConstructHub instance. This is a
   great starting point for people who consider operating a self-hosted instance
   of ConstructHub; and for new operators on-boarding the platform.

1. [Operator Runbook](./docs/operator-runbook.md) is a series of diagnostics and
   troubleshooting guides indended for operators to have a quick and easy way to
   navigate a ConstructHub instance when they are reacting to an alarm or bug
   report.

### :baby_chick: Deployment Canaries

Construct Hub provides several built-in validation mechanisms to make sure the
deployment of your instance is continuously operating as expected.

These mechanisms come in the form of canary testers that are part of the
ConstructHub deployment stack. Each canary runs periodically and performs a
different check, triggering a different CloudWatch alarm in case it detects a
failure.

We recommend that you use staged deployments, and block promotions to the
production stage in case any preivous stage triggers an alarm within a specific
timeframe.

#### Discovery Canary

When configuring an `NpmJs` package source, a package discovery canary can be
enabled using the `enableCanary` property (and optionally configured using the
`canaryPackage` and `canarySla` properties). This feature is activated by
default and monitors availability of releases of the `construct-hub-probe` npm
package in the ConstructHub instance.

Probe packages, such as `construct-hub-probe` are published frequently (e.g:
every 3 hours or more frequently), and can be used to ensure the ConstructHub
instance correctly discovers, indexes and represents those packages.

If a different package or SLA should be used, you can configure the `NpmJs`
package source manually like so:

```ts
import * as codeartifact from '@aws-cdk/aws-codeartifact';
import { App, Stack } from '@aws-cdk/core';
import { sources, ConstructHub } from 'construct-hub';

const app = new App();
const stack = new Stack(app, 'StackName', { /* ... */ });

new ConstructHub(stack, 'ConstructHub', {
  // ...
  packageSources: [
    // ...
    new sources.NpmJs({
      enableCanary: true, // This is the default
      canaryPackage: '@acme/my-constructhub-probe',
      canarySla: Duration.minutes(30),
    }),
    // ...
  ],
  // ...
});
```

In case the new package isn't fully available in the predefined SLA, a
**high severity** CloudWatch alarm will trigger, which will in turn trigger
the configured action for low severity alarms.

> See [Monitoring & Alarms](./docs/application-overview.md#monitoring--alarming)

The operator runbook contains [instructions](./docs/operator-runbook.md) on how
to diagnose and mitigate the root cause of the failure.

### :nail_care: Customizing the frontend

There are a number of customizations available in order to make your private
construct hub better tailored to your organization.

#### Package Tags

Configuring package tags allows you to compute additional labels to be applied
to packages. These can be used to indicate to users which packages are owned by
trusted organizations, or any other arbitrary conditions, and can be referenced
while searching.

For example:

```ts
new ConstructHub(this, "ConstructHub", {
  ...myProps,
  packageTags: [{
    id: 'official',
    condition: TagCondition.field('name').eq('construct-hub'),
    keyword: {
      label: 'Official',
      color: '#00FF00',
    },
    highlight: {
      label: 'Vended by AWS',
      color: '#00FF00',
    }
  }]
});
```

The above example will result in packages with the `name` of `construct-hub` to
receive the `Official` tag, which is colored green and displayed amongst the
list of keywords. Additionally the `highlight` key shows this as a highlighted
item on the package's card.

The `searchFilter` key can also be used to show tags as search filters grouped
together.

```ts
const authorsGroup = new PackageTagGroup("authors", {
  label: "Authors",
  tooltip: "Information about the authors filter",
  filterType: FilterType.checkbox(),
});

const isAws = TagCondition.field('name').eq('construct-hub');
new ConstructHub(this, "ConstructHub", {
  ...myProps,
  packageTags: [{
    id: 'AWS',
    condition: isAws,
    searchFilter: {
      group: authorsGroup,
      display: 'AWS',
    },
  }, {
    id: 'Community',
    condition: TagCondition.not(isAws),
    searchFilter: {
      group: authorsGroup,
      display: 'AWS',
    },
  }]
});
```

The above will show a list of `Authors` filters on the search results page
with a checkbox for each `AWS` and `Community` packages, allowing users to
filter results by the presence of these tags.

Combinations of conditions are also supported:

```ts
new ConstructHub(this, "ConstructHub", {
  ...myProps,
  packageTags: [{
    label: 'Official',
    color: '#00FF00',
    condition: TagCondition.or(
      TagCondition.field('name').eq('construct-hub'),
      TagCondition.field('name').eq('construct-hub-webapp'),
    ),
  }]
});

// or more succintly if you have a long list
condition: TagCondition.or(
  ...['construct-hub', 'construct-hub-webapp', '...',]
    .map(name => TagCondition.field('name').eq(name))
),
```

You can assert against any value within package json including nested ones.

```ts
TagCondition.field('constructHub', 'nested', 'key').eq('value');

// checks
packageJson?.constructHub?.nested?.key === value;
```

You can also assert that a string occurs at least a certain number of times
within the package's README.

```ts
TagCondition.readme().includes('ECS');
TagCondition.readme().includes('fargate', { atLeast: 3, caseSensitive: false });
```

#### Package Links

Configuring package links allows you to replace the `Repository`, `License`,
and `Registry` links on the package details page with whatever you choose.

For example:

```ts
new ConstructHub(this, "ConstructHub", {
  ...myProps,
  packageLinks: [{
    linkLabel: 'Service Level Agreement',
    configKey: 'SLA',
  }, {
    linkLabel: 'Contact',
    configKey: 'Contact',
    linkText: 'Email Me!',
    allowedDomains: ['me.com'],
  }]
});
```

This would allow publishers to add the following to their package.json:

```json
"constructHub": {
  "packageLinks": {
    "SLA": "https://support.mypackage.com",
    "Contact": "me.com/contact"
  }
}
```

Then the links on the corresponding package page would show these items as
configured.

#### Home Page

The home page is divided into sections, each with a header and list of packages.
Currently, for a given section you can display either the most recently updated
packages, or a curated list of packages.

For example:

```ts
new ConstructHub(this, "ConstructHub", {
  ...myProps,
  featuredPackages: {
    sections: [
      {
        name: "Recently updated",
        showLastUpdated: 4
      },
      {
        name: "From the AWS CDK",
        showPackages: [
          {
            name: "@aws-cdk/core"
          },
          {
            name: "@aws-cdk/aws-s3",
            comment: "One of the most popular AWS CDK libraries!"
          },
          {
            name: "@aws-cdk/aws-lambda"
          },
          {
            name: "@aws-cdk/pipelines"
            comment: "The pipelines L3 construct library abstracts away many of the details of managing software deployment within AWS."
          }
        ]
      }
    ]
  }
});
```

#### Browse Categories

The Construct Hub home page includes a section that displays a set of buttons
that represent browsing categories (e.g. "Databases", "Monitoring",
"Serverless", etc).

You can use the `categories` option to configure these categories. Each category
is defined by a `title` and a `url`, which will be the link associated with the
button.

```ts
new ConstructHub(this, "ConstructHub", {
  ...myProps,
  categories: [
    { title: 'Databases', url: '?keywords=databases' },
    { title: 'Monitoring', url: '?q=monitoring' },
    { title: 'Partners', url: '?tags=aws-partner' }
  ]
});
```

#### Feature Flags

Feature flags for the web app can be used to enable or disable experimental
features. These can be customized through the `featureFlags` property - for
more information about the available flags, check the documentation for
<https://github.com/cdklabs/construct-hub-webapp/>.

#### AppRegistry

By default, an AppRegistry application will be created that is associated
with the stack you put the `ConstructHub` construct in.

## :raised_hand: Contributing

If you are looking to contribute to this project, but don't know where to start,
have a look at our [contributing guide](CONTRIBUTING.md)!

## :cop: Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more
information.

## :balance_scale: License

This project is licensed under the Apache-2.0 License.
