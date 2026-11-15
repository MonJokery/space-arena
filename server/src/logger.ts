import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';

export type LogEntry = Record<string, string | number | boolean | undefined>;
export type Logger = { write(event: LogEntry): Promise<void>; close(): Promise<void>; path: string };
export async function createLogger(logsDir: string): Promise<Logger> {
  await mkdir(logsDir, { recursive: true });
  const input = new PassThrough({ objectMode: true, highWaterMark: 32 });
  const format = new Transform({
    writableObjectMode: true,
    transform(event: unknown, _encoding, callback) {
      try { callback(null, `${JSON.stringify(event)}\n`); }
      catch (error: unknown) { callback(error instanceof Error ? error : new Error(String(error))); }
    },
  });
  const output = createWriteStream(join(logsDir, 'match.ndjson'), { flags: 'a' });
  const completed = pipeline(input, format, output);
  let failure: Error | null = null;
  completed.catch((error: unknown) => { failure = error instanceof Error ? error : new Error(String(error)); });
  return {
    async write(event: LogEntry): Promise<void> {
      if (failure) throw failure;
      if (!input.write({ timestamp: new Date().toISOString(), ...event })) await once(input, 'drain');
    },
    async close(): Promise<void> { input.end(); await completed; },
    path: join(logsDir, 'match.ndjson'),
  };
}
