import { github } from 'projen';
import { NodeProject } from 'projen/lib/javascript';

export function addVpcAllowListManagement(project: NodeProject) {
  const workflow = project.github?.addWorkflow('update-vpc-acl-allow-lists');

  const prTitle = 'chore: upgrade network ACL allow-lists';
  const prBody =
    'Updated the network ACL allow-lists from authoritative sources.';

  workflow?.addJobs({
    update: {
      permissions: {
        actions: github.workflows.JobPermission.WRITE,
        contents: github.workflows.JobPermission.WRITE,
        pullRequests: github.workflows.JobPermission.WRITE,
      },
      runsOn: ['ubuntu-latest'],
      steps: [
        {
          name: 'Check Out',
          uses: 'actions/checkout@v2',
        },
        // Update the NPM IP ranges (they are fronted by CloudFlare)
        // See: https://npm.community/t/registry-npmjs-org-ip-address-range/5853.html
        {
          name: 'Update CloudFlare IP lists',
          // See: https://www.cloudflare.com/ips
          run: [
            'curl -SsL "https://www.cloudflare.com/ips-v4" \\',
            '     -o resources/vpc-allow-lists/cloudflare-IPv4.txt',
            //// We do not emit IPv6 allow-lists as our VPC does not have IPv6 support
            // 'curl -SsL "https://www.cloudflare.com/ips-v6" \\',
            // '     -o resources/vpc-allow-lists/cloudflare-IPv6.txt',
          ].join('\n'),
        },
        // Allowing GitHub (web and git)
        {
          name: 'Setup Node',
          uses: 'actions/setup-node@v2',
        },
        {
          name: 'Update GitHub IP lists',
          // See: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-githubs-ip-addresses
          run: 'node ./update-github-ip-allowlist.js',
        },
        // And now make a PR if necessary
        {
          name: 'Make Pull Request',
          uses: 'peter-evans/create-pull-request@v3',
          with: {
            token: project?.github?.projenCredentials.tokenRef,
            branch: `automation/${workflow.name}`,
            'commit-message': `${prTitle}\n\n${prBody}`,
            title: prTitle,
            body: prBody,
            labels: 'auto-approve',
            author: 'github-actions <github-actions@github.com>',
            committer: 'github-actions <github-actions@github.com>',
            signoff: true,
          },
        },
      ],
    },
  });

  // This workflow runs every day at 13:37.
  workflow?.on({ schedule: [{ cron: '37 13 * * *' }] });

  project.npmignore?.addPatterns('/update-github-ip-allowlist.js');
}
