interface CloudFrontResponse {
  response: any;
  headers: {
    [key: string]: {
      value: string;
    };
  };
}

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
      "connect-src 'self' https://*.shortbread.aws.dev https://a0.awsstatic.com/ https://amazonwebservices.d2.sc.omtrdc.net https://aws.demdex.net https://dpm.demdex.net https://cm.everesttech.net;",
      'frame-src https://aws.demdex.net https://dpm.demdex.net;',
      "img-src 'self' https://* https://a0.awsstatic.com/ https://amazonwebservices.d2.sc.omtrdc.net https://aws.demdex.net https://dpm.demdex.net https://cm.everesttech.net;",
      "object-src 'none';",
      "style-src 'self' 'unsafe-inline';",
    ].join(' '),
  };

  return response;
}
