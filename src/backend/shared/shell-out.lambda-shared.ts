import { spawn } from 'child_process';

/**
 * Executes the specified command in a sub-shell, and asserts success.
 */
export function shellOut(cmd: string, ...args: readonly string[]): Promise<void> {
  return new Promise<void>((ok, ko) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.once('error', ko);
    child.once('close', (code, signal) => {
      if (code === 0) {
        return ok();
      }
      const reason = code != null
        ? `exit code ${code}`
        : `signal ${signal}`;
      ko(new Error(`Command "${cmd} ${args.join(' ')}" failed with ${reason}`));
    });
  });
}
