import type { CloudFrontFunctionsEvent } from 'aws-lambda';

export function handler(event: CloudFrontFunctionsEvent): CloudFrontFunctionsEvent['response'] {
  var response = event.response;
  var headers = response.headers;

  // Delete S3 metadata headers (irrelevant for the customer)
  for (const key of Object.keys(headers)) {
    const lkKey = key.toLowerCase();
    if (lkKey.startsWith('x-amz-meta-')) {
      delete headers[key];
    }
  }

  // Set up security posture headers
  headers['x-frame-options'] = { value: 'deny' };
  headers['x-xss-protection'] = { value: '1; mode=block' };
  headers['x-content-type-options'] = { value: 'nosniff' };
  headers['strict-transport-security'] = { value: 'max-age=47304000; includeSubDomains' };
  headers['content-security-policy'] = {
    value:
      [
        "default-src 'self' 'unsafe-inline' https://*.awsstatic.com;",
        "connect-src 'self' https://*.shortbread.aws.dev;",
        "frame-src 'none';",
        "img-src 'self' https://* http://*.omtrdc.net;",
        "object-src 'none';",
        "style-src 'self' 'unsafe-inline';",
      ].join(' '),
  };

  return response;
}
