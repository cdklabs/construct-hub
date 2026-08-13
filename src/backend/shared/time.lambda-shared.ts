export const now = Date.now;

export async function sleep(ms: number) {
  return new Promise((ok) => setTimeout(ok, ms));
}
