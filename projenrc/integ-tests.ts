import { basename, dirname, join } from 'path';
import * as glob from 'glob';
import { TypeScriptProject } from 'projen/lib/typescript';

/**
 * Adds `integ:xxx` tasks for integration tests based on all files with the
 * `.integ.ts` extension, which are used as CDK application entrypoints.
 *
 * To run an integration test, just run `yarn integ:xxx` (with your environment
 * set up to your AWS development account).
 */
export function discoverIntegrationTests(project: TypeScriptProject) {
  const files = glob.sync('**/*.integ.ts', { cwd: project.srcdir });
  for (const entry of files) {
    console.log(`integration test: ${entry}`);
    const name = basename(entry, '.integ.ts');

    const libdir = join(project.libdir, dirname(entry));
    const srcdir = join(project.srcdir, dirname(entry));

    const deploydir = join(srcdir, `.tmp.${name}.integ.cdkout.deploy`);
    const actualdir = join(srcdir, `.tmp.${name}.integ.cdkout.actual`);
    const snapshotdir = join(srcdir, `${name}.integ.cdkout`);

    const app = `"node ${join(libdir, basename(entry, '.ts'))}.js"`;

    const options = [
      `--app ${app}`,
      '--no-version-reporting',
      '--context @aws-cdk/core:newStyleStackSynthesis=true',
    ].join(' ');

    const deploy = project.addTask(`integ:${name}:deploy`, {
      description: `deploy integration test ${entry}`,
    });

    if (name === 'transliterator.ecstask') {
      deploy.exec(
        'cp -r src/__tests__/backend/transliterator/fixtures lib/__tests__/backend/transliterator'
      );
    }
    deploy.exec(`rm -fr ${deploydir}`);
    deploy.exec(
      `cdk deploy ${options} --require-approval=never -o ${deploydir}`
    );

    // if deployment was successful, copy the deploy dir to the expected dir
    deploy.exec(`rm -fr ${snapshotdir}`);
    deploy.exec(`mv ${deploydir} ${snapshotdir}`);

    const destroy = project.addTask(`integ:${name}:destroy`, {
      description: `destroy integration test ${entry}`,
      exec: `cdk destroy --app ${snapshotdir} --no-version-reporting`,
    });

    deploy.spawn(destroy);

    const assert = project.addTask(`integ:${name}:assert`, {
      description: `synthesize integration test ${entry}`,
    });

    const exclude = [
      'asset.*',
      'cdk.out',
      'manifest.json',
      'tree.json',
      '.cache',
    ];

    if (name === 'transliterator.ecstask') {
      assert.exec(
        'cp -r src/__tests__/backend/transliterator/fixtures lib/__tests__/backend/transliterator'
      );
    }
    assert.exec(`cdk synth ${options} -o ${actualdir} > /dev/null`);
    assert.exec(
      `diff -r ${exclude
        .map((x) => `-x ${x}`)
        .join(' ')} ${snapshotdir}/ ${actualdir}/`
    );

    project.addTask(`integ:${name}:snapshot`, {
      description: `update snapshot for integration test ${entry}`,
      exec: `cdk synth ${options} -o ${snapshotdir} > /dev/null`,
    });

    // synth as part of our tests, which means that if outdir changes, anti-tamper will fail
    project.testTask.spawn(assert);
    project.addGitIgnore(`!${snapshotdir}`); // commit outdir to git but not assets

    // do not commit all files we are excluding
    for (const x of exclude) {
      project.addGitIgnore(`${snapshotdir}/${x}`);
      project.addGitIgnore(`${snapshotdir}/**/${x}`); // nested assemblies
    }

    project.addGitIgnore(deploydir);
    project.addPackageIgnore(deploydir);
    project.addGitIgnore(actualdir);
    project.addPackageIgnore(actualdir);

    // commit the snapshot (but not into the tarball)
    project.addGitIgnore(`!${snapshotdir}`);
    project.addPackageIgnore(snapshotdir);
  }
}
