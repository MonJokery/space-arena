import { createWriteStream } from 'node:fs';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';

const base = process.env.BASE_URL || 'http://localhost:3000';
const logDir = process.env.LOGS_DIR || new URL('../../logs/', import.meta.url).pathname;
await mkdir(logDir, { recursive: true });
const file = join(logDir, 'match.ndjson');
const original = await stat(file).catch(() => null);
if (!original || original.size < 40 * 1024 * 1024) {
  console.log('Generating test log (~50 MiB). Stop the server first, then restart it before continuing.');
  const stream = createWriteStream(file, { flags: 'a' });
  for (let i = 0; i < 180000; i++) {
    const line = `${JSON.stringify({ timestamp: new Date().toISOString(), type: 'test', index: i, detail: 'x'.repeat(230) })}\n`;
    if (!stream.write(line)) await once(stream, 'drain');
  }
  stream.end();
  await once(stream, 'finish');
  console.log('Test log generated. Now run this script again with the server running.');
  process.exit(0);
}
const result = await fetch(`${base}/api/replay`);
if (!result.ok) throw new Error(`Replay HTTP ${result.status}`);
const reader = result.body.getReader();
const samples = [];
const start = performance.now();
let lastSample = -1;
async function sample() {
  const seconds = (performance.now() - start) / 1000;
  const slot = Math.floor(seconds);
  if (slot === lastSample) return;
  lastSample = slot;
  const health = await (await fetch(`${base}/health`, { cache: 'no-store' })).json();
  samples.push({ seconds: Number(seconds.toFixed(2)), rssMiB: Number((health.rss / (1024 * 1024)).toFixed(2)) });
}
await sample();
let transferred = 0;
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  transferred += value.byteLength;
  await new Promise((resolve) => setTimeout(resolve, 20));
  await sample();
}
await sample();
const min = Math.min(...samples.map((row) => row.rssMiB)) - 2;
const max = Math.max(...samples.map((row) => row.rssMiB)) + 2;
const maxT = samples.at(-1).seconds || 1;
const x = (value) => 65 + (value / maxT) * 840;
const y = (value) => 275 - ((value - min) / (max - min)) * 235;
const path = samples.map((row, i) => `${i ? 'L' : 'M'} ${x(row.seconds).toFixed(1)} ${y(row.rssMiB).toFixed(1)}`).join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="330" viewBox="0 0 960 330"><rect width="960" height="330" fill="#fff"/><g stroke="#ccc"><path d="M65 40V275H905" fill="none"/></g><g fill="#333" font-family="sans-serif" font-size="15"><text x="60" y="22">Node.js RSS (MiB) — slow replay download</text><text x="15" y="48">${max.toFixed(1)}</text><text x="15" y="275">${min.toFixed(1)}</text><text x="790" y="310">Time (seconds)</text><text x="65" y="300">0</text><text x="885" y="300">${maxT.toFixed(0)}</text></g><path d="${path}" fill="none" stroke="#2365b4" stroke-width="2.5"/></svg>`;
await writeFile('rss.svg', svg);
await writeFile('rss.csv', 'seconds,rssMiB\n' + samples.map((row) => `${row.seconds},${row.rssMiB}`).join('\n') + '\n');
console.log(`Downloaded ${(transferred / 1048576).toFixed(1)} MiB; RSS range ${(max - min - 4).toFixed(2)} MiB; wrote rss.csv and rss.svg`);
