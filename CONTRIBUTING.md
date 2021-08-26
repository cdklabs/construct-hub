# Contributing Guidelines

Thank you for your interest in contributing to our project. Whether it's a bug report, new feature,
correction, or additional documentation, we greatly value feedback and contributions from our
community.

Please read through this document before submitting any issues or pull requests to ensure we have
all the necessary information to effectively respond to your bug report or contribution.


## Overall Considerations

### Code of Conduct
This project has adopted the [Amazon Open Source Code of Conduct][amazon-oss-code-of-conduct].
For more information see the [Code of Conduct FAQ][amazon-oss-code-of-conduct#faq] or contact
`opensource-codeofconduct@amazon.com` with any additional questions or comments.

[amazon-oss-code-of-conduct]: https://aws.github.io/code-of-conduct
[amazon-oss-code-of-conduct#faq]: https://aws.github.io/code-of-conduct-faq

### Security issue notifications
If you discover a potential security issue in this project we ask that you notify AWS/Amazon
Security via our [vulnerability reporting page][vuln-reporting-page]. Please do **not** create a
public github issue.

[vuln-reporting-page]: http://aws.amazon.com/security/vulnerability-reporting/

### Licensing

This project is licensed under the [Apache-2.0 License](LICENSE). We will ask you to confirm the
licensing of your contribution.


## Making Effective Contributions

### Reporting Bugs/Feature Requests

We welcome you to use the GitHub issue tracker to report bugs or suggest features.

When filing an issue, please check existing open, or recently closed, issues to make sure somebody else hasn't already
reported the issue. Please try to include as much information as you can. Details like these are incredibly useful:

* A reproducible test case or series of steps
* The version of our code being used
* Any modifications you've made relevant to the bug
* Anything unusual about your environment or deployment

### Contributing via Pull Requests
Contributions via pull requests are much appreciated. Before sending us a pull request, please ensure that:

1. You are working against the latest source on the *main* branch.
2. You check existing open, and recently merged, pull requests to make sure someone else hasn't addressed the problem already.
3. You open an issue to discuss any significant work - we would hate for your time to be wasted.

To send us a pull request, please:

1. Fork the repository.
2. Modify the source; please focus on the specific change you are contributing. If you also reformat all the code, it will be hard for us to focus on your change.
3. Ensure local tests pass.
4. Commit to your fork using clear commit messages.
5. Send us a pull request, answering any default questions in the pull request interface.
6. Pay attention to any automated CI failures reported in the pull request, and stay involved in the conversation.

GitHub provides additional document on [forking a repository](https://help.github.com/articles/fork-a-repo/) and
[creating a pull request](https://help.github.com/articles/creating-a-pull-request/).


### Finding contributions to work on
Looking at the existing issues is a great way to find something to contribute on. As our projects, by default, use the default GitHub issue labels (enhancement/bug/duplicate/help wanted/invalid/question/wontfix), looking at any 'help wanted' issues is a great place to start.


## Development Workflow

### Building

### Deploying a Development Environment

The `test/devapp` directory includes an AWS CDK app designed for deploying the
construct hub into a development account. This app is also used as a golden
snapshot, so every time the construct changes, you'll see its snapshot updated.

To bootstrap your developer account, use the following command:

```shell
CDK_NEW_BOOTSTRAP=1 npx cdk bootstrap aws://ACCOUNT/REGION
```

Use the following tasks to work with the dev app. It will always work with the
currently configured CLI account/region:

* `yarn dev:synth` - synthesize into `test/devapp/cdk.out`
* `yarn dev:deploy` - deploy to the current environment
* `yarn dev:diff` - diff against the current environment

### Testing

To run all tests, run `yarn test`.

Unit tests are implemented using [jest](https://jestjs.io/).

Integration tests are implemented as small CDK applications under files called
`.integ.ts`. For each integration test, you can use the following tasks:

* `integ:xxx:deploy` - deploys the integration test to your personal development
  account and stores the output under a `.cdkout` directory which is committed
  to the repository.
* `integ:xxx:assert` - runs during `yarn test` and compares the synthesized
  output of the test to the one in `.cdkout`.
* `integ:xxx:snapshot` - synthesizes the app and updates the snapshot without
  actually deploying the stack (generally not recommended)
* `integ:xxx:destroy` - can be used to delete the integration test app (called
  by `deploy` as well)

To deploy integration test apps, you'll need to configure your environment with
AWS credentials as well as set `AWS_REGION` to refer to the region you wish to
use.

Integration tests use "triggers" which are lambda functions that are executed
during deployment and are used to make assertions about the deployed resources.
Triggers are automatically generated for all files named `trigger.xxx.lambda.ts`
(for example, `trigger.prune-test.lambda.ts`) and can just be added to the
integration test stack with the relevant dependencies. See the deny-list
integration test as an example.
