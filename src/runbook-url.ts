// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../package.json');

/**
 * The URL to the runbook for this release of ConstructHub.
 */
export const RUNBOOK_URL = version === '0.0.0'
  ? 'https://github.com/cdklabs/construct-hub/blob/main/docs/operator-runbook.md'
  : `https://github.com/cdklabs/construct-hub/blob/v${version}/docs/operator-runbook.md`;
