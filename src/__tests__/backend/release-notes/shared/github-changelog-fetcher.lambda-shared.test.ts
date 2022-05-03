import { Octokit } from '@octokit/rest';
import { getServiceLimits } from '../../../../backend/release-notes/shared/github-changelog-fetcher.lambda-shared';
jest.mock('@octokit/rest');
describe('github-changelog-fetcher', () => {
  const GITHUB_TOKEN = 'mock-token';
  beforeEach(() => {
    process.env.GITHUB_TOKEN = GITHUB_TOKEN;
  });
  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  test('getServiceLimits', async () => {
    const mockedOctoKit = Octokit as jest.MockedClass<typeof Octokit>;
    const rateLimitResponseCore = {
      limit: 500,
      remaining: 400,
      reset: new Date().getMilliseconds() + 1000,
      used: 100,
    };
    const requestHandler = jest.fn().mockResolvedValue({
      data: { resources: { core: rateLimitResponseCore } },
    });
    mockedOctoKit.prototype.rest = {
      rateLimit: {
        get: requestHandler,
      },
    };
    await expect(getServiceLimits()).resolves.toEqual(rateLimitResponseCore);
    expect(mockedOctoKit.mock.calls[0][0]).toEqual({
      auth: GITHUB_TOKEN,
      userAgent: 'github-changelog-generator',
    });
  });

  test('getReleaseNotesFromTag', async () => {});
});
