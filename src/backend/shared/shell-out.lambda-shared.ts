import { spawn } from 'child_process';

export interface ShellOutput {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Executes the specified command in a sub-shell, and asserts success.
 */
export function shellOut(cmd: string, ...args: readonly string[]): Promise<ShellOutput> {
  return new Promise<ShellOutput>((ok, ko) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const stdout = new Array<Buffer>();

    child.stdout.on('data', (chunk) => {
      stdout.push(Buffer.from(chunk));
    });
    const stderr = new Array<Buffer>();
    child.stderr.on('data', (chunk) => {
      stderr.push(Buffer.from(chunk));
    });

    child.once('error', ko);
    child.once('close', (code, signal) => {
      if (code === 0) {
        return ok({ stdout: Buffer.concat(stdout).toString('utf-8').trim(), stderr: Buffer.concat(stderr).toString('utf-8').trim() });
      }
      const reason = code != null
        ? `exit code ${code}`
        : `signal ${signal}`;
      ko(new Error(`Command "${cmd} ${args.join(' ')}" failed with ${reason}`));
    });
  });
}

/**
 * Executes the specified command in a sub-shell. Instead of asserting success,
 * this captures all data sent to `STDOUT` and returns that, with the command's
 * exit code or signal.
 */
export function shellOutWithOutput(cmd: string, ...args: readonly string[]): Promise<ShellOutResult> {
  return new Promise((ok, ko) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks = new Array<Buffer>();
    child.stdout.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    child.once('error', ko);
    child.once('close', (exitCode, signal) => {
      const stdout = Buffer.concat(chunks);
      ok({ exitCode, signal, stdout });
    });
  });
}

export interface ShellOutResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: Buffer;
}
