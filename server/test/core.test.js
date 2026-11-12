import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConfig } from '../src/config.js';
import { RoomStore } from '../src/room.js';
import { parseMessage } from '../src/protocol.js';
import { createLogger } from '../src/logger.js';
import { createHttpServer } from '../src/http.js';

test('config validates PORT and LOGS_DIR', () => {
  assert.equal(getConfig({ PORT: '3000', LOGS_DIR: './logs' }).port, 3000);
  assert.throws(() => getConfig({ PORT: '70000' }));
  assert.throws(() => getConfig({ PORT: 'abc' }));
  assert.throws(() => getConfig({ PORT: '3000', LOGS_DIR: ' ' }));
});
test('RoomStore joins and sweeps empty rooms', () => {
  const rooms = new RoomStore();
  const room = rooms.getOrCreate('training');
  const user = { name: 'Pilot' };
  room.join(user);
  assert.equal(rooms.list()[0].players, 1);
  rooms.leave(room, user);
  assert.equal(rooms.active.size, 0);
  assert.equal(rooms.list()[0].players, 0);
});
test('RoomStore supports room creation', () => {
  const rooms = new RoomStore();
  assert.deepEqual(rooms.create({ id: 'new', name: 'New' }), { id: 'new', name: 'New' });
  assert.equal(rooms.create({ id: 'new' }), null);
});
test('protocol validates messages strictly', () => {
  assert.deepEqual(parseMessage(Buffer.from('{"type":"join","name":" Pilot ","roomId":"tiny"}')), { type: 'join', name: 'Pilot', roomId: 'tiny' });
  assert.deepEqual(parseMessage(Buffer.from('{"type":"chat","text":"hello"}')), { type: 'chat', text: 'hello' });
  for (const raw of ['{', '{"type":"position","x":1}', '{"type":"chat","text":3}', '{"type":"chat","text":""}', '{"type":"leave","unexpected":1}', '{"type":"join","name":"x","roomId":".."}']) {
    assert.throws(() => parseMessage(Buffer.from(raw)));
  }
  assert.throws(() => parseMessage(Buffer.from(' '.repeat(4097))));
});
test('logger writes NDJSON with pipeline', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'space-arena-'));
  try {
    const logger = await createLogger(dir);
    await logger.write({ type: 'chat', text: 'hello' });
    await logger.close();
    const items = (await readFile(logger.path, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(items[0].text, 'hello');
    assert.ok(items[0].timestamp);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('HTTP endpoints, static file, POST rooms and path traversal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'space-http-'));
  const logger = await createLogger(dir);
  const rooms = new RoomStore();
  const config = { clientDir: new URL('../../client/', import.meta.url).pathname };
  const server = createHttpServer(config, rooms, logger);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await (await fetch(`${base}/health`)).json()).status, 'ok');
    assert.equal((await (await fetch(`${base}/api/rooms`)).json()).rooms.length, 3);
    const response = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'custom', name: 'Custom', width: 800, height: 600, asteroids: 2 }) });
    assert.equal(response.status, 201);
    assert.equal((await (await fetch(`${base}/api/rooms`)).json()).rooms.length, 4);
    const { request } = await import('node:http');
    const blocked = await new Promise((resolve, reject) => {
      const req = request(`${base}/`, { path: '/%2e%2e/server/package.json' }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.end();
    });
    assert.equal(blocked, 403);
    assert.equal((await fetch(`${base}/index.html`)).status, 200);
    await logger.write({ type: 'joined', name: 'Pilot' });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const replay = await fetch(`${base}/api/replay`);
    assert.equal(replay.status, 200);
    assert.match(await replay.text(), /"type":"joined"/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await logger.close();
    await rm(dir, { recursive: true, force: true });
  }
});
