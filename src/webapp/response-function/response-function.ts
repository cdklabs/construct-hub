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
      'default-src \'none\'; img-src \'self\' https://img.shields.io; script-src \'self\'; style-src \'unsafe-inline\' \'self\'; object-src \'none\'; connect-src \'self\'; manifest-src \'self\'; font-src \'self\'; frame-src \'none\'',
  };

  return response;
}
