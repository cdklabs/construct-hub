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

1. [Application Overview](./docs/application-overview.md) provides a high-level
   description of the components that make a ConstructHub instance. This is a
   great starting point for people who consider operating a self-hosted instance
   of ConstructHub; and for new operators on-boarding the platform.

1. [Operator Runbook](./docs/operator-runbook.md) is a series of diagnostics and
   troubleshooting guides indended for operators to have a quick and easy way to
   navigate a ConstructHub instance when they are reacting to an alarm or bug
   report.

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
    label: 'Official',
    color: '#00FF00',
    condition: TagCondition.field('name').eq('construct-hub'),
  }]
});
```

The above example will result in packages with the `name` of `construct-hub` to
receive the `Official` tag, which is colored green.

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

## :raised_hand: Contributing

If you are looking to contribute to this project, but don't know where to start,
have a look at our [contributing guide](CONTRIBUTING.md)!


## :cop: Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more
information.


## :balance_scale: License

This project is licensed under the Apache-2.0 License.
