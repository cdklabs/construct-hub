# Publishing Construct Libraries

This tutorial will walk you through writing your a construct library and
publishing it to [Construct Hub](https://constructs.dev).

**TL;DR**: We recommend using one of the construct library project types in
[Projen] to create and manage your construct library project on GitHub. To
create a new project, run `npx projen new awscdk-construct | cdk8s-construct |
cdktf-construct`.

[Projen]: https://github.com/projen/projen

## Overview

Technically, the [Construct Hub](https://constructs.dev/) will automatically
discover and list all [public npm](https://www.npmjs.com/) modules which adhere
to following requirements:

1. Compiled using [JSII](https://github.com/aws/jsii/) and includes the `.jsii`
   manifest file.
2. Annotated with the keyword `aws-cdk` (for AWS CDK), `cdk8s` (for CDK for
   Kubernetes) or `cdktf` (for CDK for Kubernetes).
3. Uses a [permissive open-source license]: Apache, BSD or MIT.

[permissive open-source license]: https://en.wikipedia.org/wiki/Permissive_software_license

It normally takes the Construct Hub a few minutes to discover and list new
package versions. If your package meets these requirements and does not appear
in the Construct Hub within 30 minutes, please [file an issue
here](https://github.com/cdklabs/construct-hub/issues/new) and we will help
figure out what happened.

This guide will walk you through setting up a construct library project on
GitHub which meets to these requirements, but also includes everything needed to
develop and manage the full lifecycle of your library.

Your construct library project will include:

* JSII compiler and packager setup which produce package artifacts for multiple
  target programming languages and package managers.
* Unit tests using [Jest](https://jestjs.io/)
* Automatic builds for pull requests
* Automated releases which include version bumps and change log publication
* Automated publishing of your package to npm, NuGet, PyPI, Maven Central and
  as a Go Module.
* Automated dependency upgrades
* More...

Since setting up all these aspects of the project is quite an involved task, we
will use a tool called [Projen] to manage our project configuration. Projen
allows you to define your project setup using code and abstracts away much of
the complexity in setting up and managing complex project configuration. In a
sense, you can think of Projen as a “CDK for Software Projects”.

## Let’s get started

In this tutorial we will create a simple construct library called
`cdk-notifying-bucket` which is an S3 bucket that sends an email notification
every time an object is updated. Think of it as a drop box that let’s users know
when someone had changed a file in it.

### Install prerequisites on your local machine

You’ll need
[git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git),
[Node.js](https://nodejs.org/en/) and
[yarn](https://classic.yarnpkg.com/en/docs/install/) (this is the default npm
client for Projen, but can be changed to npm if desired).

### Create a GitHub repository

Start by creating a [new GitHub repository](https://github.com/new) for your
project. Give it a nice name (a common convention for construct libraries is to
use a `cdk-` prefix (or `cdk8s-` or `cdktf-`) and provide a useful description.
No need to add any files to your repository, Projen will take care of that.

### Clone the repository to your local machine

Clone your new, empty, repository to your local machine and change your working
directory:

```shell
$ git clone https://github.com/eladb/cdk-notifying-bucket.git
Cloning into 'cdk-notifying-bucket'...
warning: You appear to have cloned an empty repository.

$ cd cdk-notifying-bucket
```

### Create your project with Projen

The next step will be to use `projen new` in order to initialize your project.

Since we are creating an AWS CDK construct library we will use the
`awscdk-construct` project type, but Projen supports project types for all
CDKs: Use `cdk8s-construct` for CDK8s construct and `cdktf-construct` for CDKtf
constructs. All of these projects types generally support the same set of
features as they are all derived from the `jsii` base type.

```shell
$ npx projen new awscdk-construct
...
```

This command will initialize your empty project and create an initial commit
(use `--no-git` if you want to commit the files yourself).

### Introducing projenrc.js

The resulting file tree of your project is quite extensive and includes ignore
files, package metadata, keywords, license, repository, author settings, jest
configuration, eslint setup, github workflows and more.

However, as a Projen user, you don’t really need to understand all these
details. Everything related to your project setup is managed from a single file
called `.projenrc.js` (sometimes referred to as an "RC file"):

```js
const { AwsCdkConstructLibrary } = require('projen');
const project = new AwsCdkConstructLibrary({
  author: 'Your Name',
  authorAddress: 'your@email.com',
  cdkVersion: '1.95.2',
  defaultReleaseBranch: 'main',
  name: 'cdk-notifying-bucket',
  repositoryUrl: 'https://github.com/eladb/cdk-notifying-bucket.git',
});
project.synth();
```

Projen generated this initial RC file based on defaults and on information from
your local environment such as your globally configured git username and email.

> By default, projen uses JavaScript for your RC file, but you can also change
> your project to use TypeScript for your projenrc file by specifying
> `--projenrc-ts` when calling `projen new`. In this case, your project setup
> will be under `.projenrc.ts`

When you update your `.projenrc` file, you’ll need to tell Projen to
"synthesize" project files based on your new definitions. To do that, you can
just run `npx projen`.

As an example, let’s modify our `projenrc.js` file to include a description and
change the license to MIT (the default is Apache 2.0):

```js
const project = new AwsCdkConstructLibrary({
  ...

  // add these
  description: 'An S3 bucket that sends an email when files are updated',
  license: 'MIT',
});
```

Now, we run:

```shell
npx projen
```

And if we examine our `git diff`, we can see that the following files
were changed:

* `.projenrc.js` - the changes you made explicitly.
* `package.json` - added a `description` field and `license` was changed from
  `"Apache-2.0"` to `"MIT"`.
* `LICENSE` - contents changed to MIT license.

This is a small demonstration of the power of Projen. A single change in your RC
file resulted in multiple concerted changes across your repository.

Another important thing to notice is that all Projen controlled files are
created as read-only files. This signals to you that those files are effectively
an "implementation detail" of your project and you should not modify them
manually.

Let's commit these changes before we move on:

```shell
git commit -am "chore: add description and change license to MIT"
```

> You'll notice that our commits follow the [conventional commits] standard. It
> is a commit message standard that is later used to automatically generate your
> changelog. The `chore:` prefix means that this commit will _not_ appear in
> your changelog.

[conventional commits]: https://www.conventionalcommits.org/en/v1.0.0/

### Sources and tests

Projen expects your TypeScript source files to be located under `src` and your
Jest unit test files to be under `test`.

A minimal sample is created when you create the project:

`src/index.ts`

```ts
export class Hello {
  public sayHello() {
    return 'hello, world!';
  }
}
```

`test/hello.test.ts`

```ts
import { Hello } from '../src';

test('hello', () => {
  expect(new Hello().sayHello()).toBe('hello, world!');
});
```

### Build

To perform a full build of your project, use `yarn build`:

```shell
yarn build
```

This command will execute a [Projen
task](https://github.com/projen/projen/blob/main/docs/tasks.md) called `build`
which performs a full build of your project. It *compiles* your code, runs unit
*tests* and *packages* artifacts for all package managers that are ready to be
published.

The default project definition produces only an npm tarball under `dist/js`:

```shell
$ ls dist/js
cdk-notifying-bucket@0.0.0.jsii.tgz
```

Your project includes other useful tasks that can be used to execute parts of
this flow. To list all tasks supported by your project, use `projen --help`:

```shell
$ npx projen --help
projen [command]

Commands:
  projen new [PROJECT-TYPE-NAME] [OPTIONS]  Creates a new projen project
  projen clobber                            hard resets to HEAD of origin and cleans the local repo
  projen compile                            Only compile
  projen test:compile                       compiles the test code
  projen test                               Run tests
  projen build                              Full release build (test+compile)
  projen test:watch                         Run jest in watch mode
  projen test:update                        Update jest snapshots
  projen bump                               Bumps version based on latest git tag and generates a changelog entry
  projen unbump                             Restores version to 0.0.0
  projen upgrade-dependencies               upgrade dependencies
  projen upgrade-projen                     upgrade projen
  projen default
  projen watch                              Watch & compile in the background
  projen package                            Create an npm tarball
  projen eslint                             Runs eslint against the codebase
  projen compat                             Perform API compatibility check against latest version
  projen publish:npm                        Publish this package to the npm Registry
  projen docgen                             Generate API.md from .jsii manifest
  projen release                            Prepare a release from "main" branch
  projen completion                         generate completion script
```

For example, the `test:watch` task will execute `jest --watch` which will
automatically execute tests when your source code changes.

### Adding CDK dependencies

Before we can write the code for our notifying bucket, we need to add some
CDK dependencies to our project. This project type in Projen explicitly
supports adding CDK deps:

Add the following calls to `addCdkDependencies()` to your `.projenrc.js` file:

```js
const project = new AwsCdkConstructLibrary({
  author: 'Elad Ben-Israel',
  // ...
});

project.addCdkDependencies('@aws-cdk/aws-s3');
project.addCdkDependencies('@aws-cdk/aws-sns');
project.addCdkDependencies('@aws-cdk/aws-sns-subscriptions');

project.synth();
```

Resynth:

```shell
npx projen
```

### Writing code for notifying bucket

Before we move on, let's write the code for our notifying bucket.

Edit `src/indes.ts`:

```ts

```

### Your README

### Publishing to npm

If you examine the `.github/workflows/release.yml` workflow file, you will
notice that it only includes a job that publishes your library to npm. This job
requires that your GitHub repository will include a secret called `NPM_TOKEN`
with an npm publishing token.

1. Follow the instructions in the [npm documentation](https://docs.npmjs.com/creating-and-viewing-authentication-tokens) on how to create an authentication token.
2. Follow the instructions in the [GitHub Documentation](https://docs.github.com/en/actions/reference/encrypted-secrets) on how to add a secret called `NPM_TOKEN` with the token you just created.

Now that your repository has an `NPM_TOKEN` secret, you can technically push
the changes from your local machine to GitHub and your library will get published to
npm and should be picked up by Construct Hub.

### Workflows

Projen automatically sets up a few GitHub workflows for your project (they can be found under `.github/workflows`):

* `build` - performs full build of your project for all pull requests
* `release` - builds and releases your library to all package managers on every
  commit to `main`.
* `upgrade-dependencies` - periodically updates project dependencies
* `stale` - automatically closes stale pull requests and issues

> One of the more powerful aspects of using Projen is that new features added to
> the project type you are using will be available to your project as soon as
> you upgrade Projen itself, so expect this set of workflows to evolve over
> time.
