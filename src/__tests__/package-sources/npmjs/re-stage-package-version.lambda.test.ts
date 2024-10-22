import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from '../../../package-sources/npmjs/re-stage-package-version.lambda';

const MOCK_FUNCTION_NAME = 'foo';
const MOCK_REGISTRY_URL = 'https://registry.npmjs.org';

const mockLambda = mockClient(LambdaClient);
const mockFetch = jest.spyOn(global, 'fetch');

beforeEach(() => {
  mockLambda.reset();
  process.env.FUNCTION_NAME = MOCK_FUNCTION_NAME;
  process.env.REGISTRY_URL = MOCK_REGISTRY_URL;
});

afterEach(() => {
  process.env.FUNCTION_NAME = undefined;
  process.env.REGISTRY_URL = undefined;
});

test('happy path', async () => {
  const event = {
    name: 'construct-hub-probe',
    version: '0.0.8000',
  };

  const mockLastModified = '2024-10-22T11:40:59.265Z';
  const mockShaSum = 'abc123';
  const mockTarball =
    'https://registry.npmjs.org/construct-hub-probe/-/construct-hub-probe-0.0.8000.tgz';
  const mockResponse = {
    name: 'construct-hub-probe',
    version: '0.0.8000',
    dist: {
      shasum: mockShaSum,
      tarball: mockTarball,
    },
  };

  // registry response
  mockFetch.mockImplementationOnce(
    jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Last-Modified': mockLastModified },
        })
      )
    )
  );

  // nock(MOCK_REGISTRY_URL)
  //   .get(`/${event.name}/${event.version}`)
  //   .reply(
  //     200,
  //     {
  //       name: 'construct-hub-probe',
  //       version: '0.0.8000',
  //       dist: {
  //         shasum: mockShaSum,
  //         tarball: mockTarball,
  //       },
  //     },
  //     {
  //       'Last-Modified': mockLastModified,
  //     }
  //   );

  await expect(handler(event)).resolves.toBe(undefined);

  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledWith(
    `${MOCK_REGISTRY_URL}/${event.name}/${event.version}`
  );
  expect(mockLambda).toHaveReceivedCommandTimes(InvokeCommand, 1);
  expect(mockLambda).toHaveReceivedCommandWith(InvokeCommand, {
    FunctionName: MOCK_FUNCTION_NAME,
    InvocationType: 'Event',
    Payload: Buffer.from(
      JSON.stringify({
        integrity: mockShaSum,
        modified: mockLastModified,
        name: event.name,
        tarballUrl: mockTarball,
        version: event.version,
      })
    ),
  });
});
