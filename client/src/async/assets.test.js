import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, withRetry, loadAll, wait } from './assets.js';

test('fetchJson перевіряє response.ok і повертає JSON', async () => {
  const data = await fetchJson('/ok', { fetchFn: async () => ({ ok: true, json: async () => ({ rooms: [] }) }) });
  assert.deepEqual(data, { rooms: [] });
  await assert.rejects(fetchJson('/bad', { fetchFn: async () => ({ ok: false, status: 404 }) }), { status: 404 });
});
test('withRetry повторює 5xx і не повторює 4xx', async () => {
  let attempts = 0;
  const result = await withRetry(() => { attempts++; if (attempts < 3) throw new Error('server'); return 42; }, { baseMs: 0 });
  assert.equal(result, 42); assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(withRetry(() => { attempts++; throw Object.assign(new Error('404'), { status: 404 }); }), { status: 404 });
  assert.equal(attempts, 1);
});
test('AbortSignal зупиняє затримку', async () => {
  const controller = new AbortController();
  const promise = wait(1000, controller.signal);
  controller.abort();
  await assert.rejects(promise);
});
test('loadAll робить manifest і прогрес по кожному JSON-файлу', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const data = url === '/manifest' ? { json: [{ id: 'rooms', url: '/rooms' }] } : { rooms: [{ id: 'a' }] };
    return { ok: true, json: async () => data };
  };
  try {
    const progress = [];
    const assets = await loadAll({ manifestUrl: '/manifest', onProgress: (item) => progress.push(item) });
    assert.deepEqual(assets.json.rooms.rooms, [{ id: 'a' }]);
    assert.equal(progress.at(-1).complete, 1);
    assert.equal(progress.at(-1).total, 1);
  } finally { globalThis.fetch = original; }
});

test('loadAll розкладає спрайти, аудіо та JSON в правильні сховища', async () => {
  const originalFetch = globalThis.fetch;
  const originalBitmap = globalThis.createImageBitmap;
  const originalDecoder = globalThis.OfflineAudioContext;
  const bitmap = { width: 256 };
  const audio = { duration: 0.3 };
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => url === '/manifest-all'
      ? { images: [{ id: 'ship', url: '/ship' }], audio: [{ id: 'fired', url: '/sound' }], json: [{ id: 'rooms', url: '/rooms' }] }
      : { rooms: [] },
    blob: async () => new Blob(['image']),
    arrayBuffer: async () => new ArrayBuffer(8),
  });
  globalThis.createImageBitmap = async () => bitmap;
  globalThis.OfflineAudioContext = class { async decodeAudioData() { return audio; } };
  try {
    const progress = [];
    const result = await loadAll({ manifestUrl: '/manifest-all', onProgress: (item) => progress.push(item) });
    assert.equal(result.images.ship, bitmap);
    assert.equal(result.audio.fired, audio);
    assert.deepEqual(result.json.rooms, { rooms: [] });
    assert.equal(progress.at(-1).complete, 3);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.createImageBitmap = originalBitmap;
    globalThis.OfflineAudioContext = originalDecoder;
  }
});
