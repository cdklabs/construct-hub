# Construct Hub

This project maintains a [AWS Cloud Development Kit][aws-cdk] construct library
that can be used to deploy instances of the Construct Hub in any AWS Account.

[aws-cdk]: https://github.com/aws/aws-cdk

## Development

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

## Testing

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

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more
information.

## License

This project is licensed under the Apache-2.0 License.
