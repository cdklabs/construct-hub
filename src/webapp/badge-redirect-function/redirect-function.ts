// @ts-ignore
function handler(event: any) {
  var request = event.request;

  if (request.querystring.darkMode) {
    return {
      statusCode: 302,
      statusDescription: 'Found',
      headers: { location: { value: '/badge-dark.svg' } },
    };
  } else {
    return {
      statusCode: 302,
      statusDescription: 'Found',
      headers: { location: { value: '/badge.svg' } },
    };
  }
}
