#!/usr/bin/env node
// ~~ Generated by projen. To modify, edit .projenrc.js and run "npx projen".

import * as os from 'os';
import { argv, env, exit } from 'process';
import { getHeapSpaceStatistics } from 'v8';
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
}

sendHeartbeat();
const heartbeat = setInterval(sendHeartbeat, 180_000);

async function main(): Promise<void> {
  try {
    const input: readonly any[] = argv.slice(2).map((text) => JSON.parse(text));
    const result = await (handler as (...args: any[]) => unknown)(...input);
    console.log('Task result:', result);
    await sfn.send(new SendTaskSuccessCommand({ output: JSON.stringify(result), taskToken }));
  } catch (err) {
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