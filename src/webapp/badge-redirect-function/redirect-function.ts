// @ts-ignore
function handler(event: any) {
  return {
    statusCode: 302,
    statusDescription: 'Found',
    headers: { location: { value: '/badge-dynamic.svg' } },
  };
}
