#!/usr/bin/env node
// ~~ Generated by projen. To modify, edit .projenrc.ts and run "npx projen".

import { execFileSync } from 'node:child_process';
import * as os from 'node:os';
import { argv, env, exit } from 'node:process';
import { getHeapSpaceStatistics } from 'node:v8';
import { SendTaskFailureCommand, SendTaskHeartbeatCommand, SendTaskSuccessCommand, SFNClient } from '@aws-sdk/client-sfn';
import { handler } from './transliterator.ecstask';

const sfn = new SFNClient({});

const taskToken = env.SFN_TASK_TOKEN!;
delete env.SFN_TASK_TOKEN;

function sendHeartbeat(): void {
  sfn.send(new SendTaskHeartbeatCommand({ taskToken })).then(
    () => console.log('Successfully sent task heartbeat!'),
    (reason) => {
      console.error('Failed to send task heartbeat:', reason);
      if (reason.$metadata.httpStatusCode === 400) {
        exit(-(os.constants.errno.ETIMEDOUT || 1));
      }
    },
  );
  const heapStats = Object.fromEntries(getHeapSpaceStatistics().filter(({ space_size }) => space_size > 0).map(
    (space) => [
      space.space_name,
      {
        size: space.space_size,
        utilization: 100 * space.space_used_size / space.space_size,
      }
    ]
  ));
  console.log(JSON.stringify(heapStats));
  if (env.RUN_LSOF_ON_HEARTBEAT) {
    execFileSync('/usr/sbin/lsof', ['-g', '-n', '-P', '-R'], { stdio: 'inherit' });
  }
}

async function main(): Promise<void> {
  // Heartbeat is expected every 5min
  const heartbeat = setInterval(sendHeartbeat, 90_000);
  try {
    const input: readonly any[] = argv.slice(2).map((text) => JSON.parse(text));

    const envArg: { env: { RUN_LSOF_ON_HEARTBEAT: string } } | undefined = input.find(
      (arg) =>
        typeof arg === 'object'
        && typeof arg?.env === 'object'
        && typeof arg?.env?.RUN_LSOF_ON_HEARTBEAT === 'string'
    );
    if (envArg != null) {
      env.RUN_LSOF_ON_HEARTBEAT = envArg.env.RUN_LSOF_ON_HEARTBEAT;
    }

    sendHeartbeat();

    const result = await (handler as (...args: any[]) => unknown)(...input);
    console.log('Task result:', result);
    await sfn.send(new SendTaskSuccessCommand({ output: JSON.stringify(result), taskToken }));
  } catch (err: any) {
    console.log('Task failed:', err);
    process.exitCode = 1;
    await sfn.send(new SendTaskFailureCommand({
      cause: JSON.stringify(err instanceof Error ? { message: err.message, name: err.name, stack: err.stack } : err),
      error: err.name ?? err.constructor.name ?? 'Error',
      taskToken,
    }));
  } finally {
    clearInterval(heartbeat);
  }
}

main().catch((cause) => {
  console.log('Unexpected error:', cause);
  exit(-1);
});
