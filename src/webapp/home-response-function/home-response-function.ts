interface CloudFrontResponse {
  response: any;
  headers: {
    [key: string]: {
      value: string;
    };
  };
}

// ignore "duplicate function implementation" conflict with other response functions
// @ts-expect-error
function handler(event: CloudFrontResponse) {
  var response = event.response;
  var headers = response.headers;

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

  headers['clear-site-data'] = { value: '"cache", "storage"' };

  return response;
}
