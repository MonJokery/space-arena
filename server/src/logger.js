import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';

export async function createLogger(logsDir) {
  await mkdir(logsDir, { recursive: true });
  const input = new PassThrough({ objectMode: true, highWaterMark: 32 });
  const format = new Transform({
    writableObjectMode: true,
    transform(event, _encoding, callback) {
      try { callback(null, `${JSON.stringify(event)}\n`); }
      catch (error) { callback(error); }
    },
  });
  const output = createWriteStream(join(logsDir, 'match.ndjson'), { flags: 'a' });
  const completed = pipeline(input, format, output);
  let failure = null;
  completed.catch((error) => { failure = error; });
  return {
    async write(event) {
      if (failure) throw failure;
      if (!input.write({ timestamp: new Date().toISOString(), ...event })) await once(input, 'drain');
    },
    async close() { input.end(); await completed; },
    path: join(logsDir, 'match.ndjson'),
  };
}
