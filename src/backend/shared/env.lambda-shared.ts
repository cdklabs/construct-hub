import { env } from 'process';

export function requireEnv(name: string): string {
  const result = env[name];
  if (!result) {
    throw new Error(`No value specified for required environment variable: ${name}`);
  }
  return result;
}
