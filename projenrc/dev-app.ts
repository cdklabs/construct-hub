import { JsonFile, Project } from 'projen';

export function addDevApp(project: Project) {
  // add "dev:xxx" tasks for interacting with the dev stack
  const devapp = 'lib/__tests__/devapp';
  const commands = ['synth', 'diff', 'deploy', 'destroy', 'bootstrap'];
  for (const cmd of commands) {
    project.addTask(`dev:${cmd}`, {
      description: `cdk ${cmd}`,
      cwd: devapp,
      exec: `npx cdk ${cmd}`,
    });
  }
  project.addTask('dev:hotswap', {
    description: 'cdk deploy --hotswap',
    cwd: devapp,
    exec: 'npx cdk deploy --hotswap',
  });

  project.gitignore.addPatterns(`${devapp}/cdk.out`);
  project.gitignore.addPatterns('.env');

  new JsonFile(project, `${devapp}/cdk.json`, {
    obj: {
      app: 'node main.js',
      context: {
        '@aws-cdk/core:newStyleStackSynthesis': true,
        '@aws-cdk/aws-apigateway:usagePlanKeyOrderInsensitiveId': true,
        'aws-cdk:enableDiffNoFail': 'true',
        '@aws-cdk/core:stackRelativeExports': 'true',
        '@aws-cdk/aws-secretsmanager:parseOwnedSecretName': true,
        '@aws-cdk/aws-kms:defaultKeyPolicies': true,
        '@aws-cdk/aws-ecs-patterns:removeDefaultDesiredCount': true,
        '@aws-cdk/aws-rds:lowercaseDbIdentifier': true,
        '@aws-cdk/aws-efs:defaultEncryptionAtRest': true,
        '@aws-cdk/aws-iam:minimizePolicies': true,
      },
    },
  });
}
