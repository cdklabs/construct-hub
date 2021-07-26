# Publishing Construct Libraries

This tutorial will walk you through writing your a construct library and publishing it to [Construct Hub](https://constructs.dev).

## TL;DR

We recommend using one of the construct library project types in [projen] to create and manage your construct library project on GitHub. To create a project, run one of the following commands and push into a GitHub repository:

* `npx projen new awscdk-construct` for AWS CDK constructs
* `npx projen new cdk8s-construct` for CDK8s constructs
* `npx projen cdktf-construct` for CDKtf constructs

[projen]: https://github.com/projen/projen

## Construct Hub Requirements

Technically, the [Construct Hub](https://constructs.dev/) will automatically list all public [npm](https://www.npmjs.com/) modules which adhere to following requirements:

1. Compiled using [JSII](https://github.com/aws/jsii/) (includes the `.jsii` metadata file).
2. Annotated with a keyword `aws-cdk` (for AWS CDK), `cdk8s` (for CDK for Kubernetes) or `cdktf` (for CDK for Kubernetes).
3. Uses a permissive open-source license: Apache, BSD or MIT.

This guide will walk you through setting up a Construct Library project on GitHub which adheres to these requirements, but also includes everything needed to develop and manage the full lifecycle of your library.

Your project will include:

1. JSII compiler and packager to produce a build package for all supported languages.
2. Eslint configuration
3. Unit tests using [Jest](https://jestjs.io/)
4. Automatic builds for pull requests
5. Automated releases which include version bumps and change log publication
6. Automated publishing of your package to npm, NuGet, PyPI, Maven Central and as a Go Module.
7. Automated dependency upgrades

Since setting up all these aspects of the project is quite an involved task, we will use a tool called [projen] to manage our project configuration. Projen allows you to define your project setup using code and abstracts away much of the complexity in setting up and managing complex project configuration. In a sense, you can think of projen as a “CDK for Software Projects”.

So let’s get started!

In this tutorial we will create a simple construct library called `cdk-notifying-bucket` which is an S3 bucket that sends an email notification every time an object is updated. Think of it as a drop box that let’s users know when someone had changed a file in it.

### Create a GitHub Repository

Start by creating a [new GitHub repository](https://github.com/new) for your project. Give it a nice name (a common convention for construct libraries is to use a `cdk-` prefix (or `cdk8s-` or `cdktf-`) and provide a useful description. No need to add any files to your repository, projen will take care of that.

### Install prerequisites

You’ll need to install [Node.js](https://nodejs.org/en/) and [yarn](https://classic.yarnpkg.com/en/docs/install/) (this is the default npm client for projen, but can be changed to npm if desired).

### Clone the git repository to your local machine

Clone your new, empty, repository to your local machine and change your working directory:

```bash
$ git clone https://github.com/eladb/cdk-notifying-bucket.git
Cloning into 'cdk-notifying-bucket'...
warning: You appear to have cloned an empty repository.

$ cd cdk-notifying-bucket
```

### Initialize your project with projen

The next step will be to use `projen new` in order to initialize your project. Use one of these project types in order to create a construct library project: `awscdk-construct` for AWS CDK, `cdk8s-construct` for CDK8s construct, `cdktf-construct` for CDKtf constructs. All of these projects types generally support the same set of features as they are all derived from the `jsii` base type.

For this example, we will create an AWS CDK construct library:

```bash
$ npx projen new awscdk-construct
✨ Project definition file was created at /Users/benisrae/code/cdk-notifying-bucket/.projenrc.js
✨ Synthesizing project...
🤖 yarn install --check-files
yarn install v1.22.10
info No lockfile found.
[1/4] 🔍  Resolving packages...
[2/4] 🚚  Fetching packages...
[3/4] 🔗  Linking dependencies...
[4/4] 🔨  Building fresh packages...
success Saved lockfile.
✨  Done in 46.79s.
✨ Synthesis complete
🤖 git init
Reinitialized existing Git repository in /Users/benisrae/code/cdk-notifying-bucket/.git/
🤖 git add .
🤖 git commit --allow-empty -m "chore: project created with projen"
...
```

This command will initialize your empty project and create an initial commit.

### Introducing projenrc.js

The resulting file tree is quite extensive and includes ignore files, package metadata, keywords, license, repository and author settings, jest configuration, eslint setup, github workflows and more.

However, as a projen user, you don’t really need to understand all these details. Everything related to your project setup is managed from a single file called `.projenrc.js`:

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

Projen generated this initial setup based on defaults and your environment (such as your configured git user name and email and the git remote setup).


> By default, projen uses JavaScript for your RC file, but you can also change your project to use TypeScript for your projenrc file by specifying `--projenrc-ts` when calling `projen new`. In this case, your project setup will be under `.projenrc.ts`


If you update your `.projenrc` file, you’ll need to tell projen to “synthesize” your project files based on your new setup. To do that, just run `npx projen`.

For example, let’s change our projenrc.js file to include a description and change the license to MIT (the default is Apache 2.0):

```js
const project = new AwsCdkConstructLibrary({
  ...

  // add these
  description: 'An S3 bucket that sends an email when files are updated',
  license: 'MIT',
});
```

Now, run `npx projen`:

```bash
$ npx projen
```

And examine the git diff:

```bash
$ git diff
diff --git a/.projenrc.js b/.projenrc.js
index f2fceac..bb70301 100644
--- a/.projenrc.js
+++ b/.projenrc.js
@@ -6,5 +6,6 @@ const project = new AwsCdkConstructLibrary({
   defaultReleaseBranch: 'main',
   name: 'cdk-notifying-bucket',
   repositoryUrl: 'git@github.com:eladb/cdk-notifying-bucket.git',
+  description: 'An S3 bucket that sends an email when files are updated',
 });
 project.synth();
diff --git a/package.json b/package.json
index b501eb0..3209787 100644
--- a/package.json
+++ b/package.json
@@ -1,5 +1,6 @@
 {
   "name": "cdk-notifying-bucket",
+  "description": "An S3 bucket that sends an email when files are updated",
   "repository": {
     "type": "git",
     "url": "git@github.com:eladb/cdk-notifying-bucket.git"
```

The diff shows that not only your projenrc file was changed (by you) but also the “description” field in your `package.json` file was updated to reflect your new description.


### Inspecting your new project (optional)

The source code is placed under `src` and tests are under `test`. Minimal sample code and test are also included, so the project is basically buildable.

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

To perform a full build of your project, use `yarn build`:

```bash
$ yarn build
```

This command will execute a projen task called `build` which handles the full build process of your project. It *compiles* your code, runs unit *tests* and *packages* artifacts for all package managers that are ready to be published. The initial setup only produces an npm tarball under `dist/js`:

```bash
$ ls dist/js
cdk-notifying-bucket@0.0.0.jsii.tgz
```

Your project includes other useful tasks that can be used to executes parts of this flow. To list all tasks supported by your project, use `projen --help`:

```bash
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

Options:
      --post     Run post-synthesis steps such as installing dependencies. Use --no-post to skip  [boolean] [default: true]
  -w, --watch    Keep running and resynthesize when projenrc changes  [boolean] [default: false]
      --debug    Debug logs  [boolean] [default: false]
      --rc       path to .projenrc.js file  [string] [default: "/Users/benisrae/code/cdk-notifying-bucket/.projenrc.js"]
      --help     Show help  [boolean]
      --version  Show version number  [boolean]
```

For example, the `test:watch` task will execute `jest --watch` which will automatically execute tests when your source code changes.

You can also inspect a specific task to see what it is composed of using `--inspect`:

```bash
$ npx projen build --inspect
description: Full release build (test+compile)
- exec: npx projen
- test
  description: Run tests
  - exec: rm -fr lib/
  - test:compile
    description: compiles the test code
    - exec: tsc --noEmit --project tsconfig.jest.json
  - exec: jest --passWithNoTests --all --updateSnapshot
  - eslint
    description: Runs eslint against the codebase
    - exec: eslint --ext .ts,.tsx --fix --no-error-on-unmatched-pattern src test build-tools .projenrc.js
- compile
  description: Only compile
  - exec: jsii --silence-warnings=reserved-word --no-fix-peer-dependencies
  - docgen
    description: Generate API.md from .jsii manifest
    - exec: jsii-docgen
- package
  description: Create an npm tarball
  - exec: jsii-pacmak
```

As you can see, the “build” task executes the “test”, “compile” and “package” tasks, each of which is composed of other subtasks and/or shell commands.

### Setting up publishing targets


