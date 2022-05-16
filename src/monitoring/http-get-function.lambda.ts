import got from 'got';

export async function handler(_: any) {
  const url = process.env.URL;
  if (!url) {
    throw new Error('URL is required');
  }

  // by default `got` will throw if there is an HTTP error
  await got(url);
}
