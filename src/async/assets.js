export function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    function abort() { clearTimeout(timer); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); }
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export async function withRetry(task, { signal, attempts = 3, baseMs = 250 } = {}) {
  for (let index = 0; index < attempts; index++) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    try { return await task(); }
    catch (error) {
      if (signal?.aborted || error.name === 'AbortError' || (error.status >= 400 && error.status < 500) || index === attempts - 1) throw error;
      await wait(baseMs * 2 ** index + Math.random() * baseMs, signal);
    }
  }
}
export async function fetchChecked(url, { signal, fetchFn = fetch } = {}) {
  const response = await fetchFn(url, { signal, cache: 'no-store' });
  if (!response.ok) { const error = new Error(`HTTP ${response.status}: ${url}`); error.status = response.status; throw error; }
  return response;
}
export async function fetchJson(url, options = {}) {
  const response = await fetchChecked(url, options);
  try { return await response.json(); }
  catch { throw new Error(`Некоректний JSON: ${url}`); }
}
export function loadJson(url, signal) { return withRetry(() => fetchJson(url, { signal }), { signal }); }
export async function loadImage(url, signal) {
  return withRetry(async () => {
    const blob = await (await fetchChecked(url, { signal })).blob();
    if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      return image;
    } finally { URL.revokeObjectURL(objectUrl); }
  }, { signal });
}
export async function loadAudio(url, signal) {
  return withRetry(async () => {
    const bytes = await (await fetchChecked(url, { signal })).arrayBuffer();
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const decoder = new OfflineAudioContext(1, 44100, 44100);
    return decoder.decodeAudioData(bytes);
  }, { signal });
}
export async function loadAll({ signal, onProgress = () => {}, manifestUrl = '/assets/manifest.json', transformEntry = (entry) => entry, delayMs = 0 } = {}) {
  const manifest = await loadJson(manifestUrl, signal);
  const entries = [
    ...(manifest.images || []).map((entry) => ({ ...entry, type: 'image' })),
    ...(manifest.audio || []).map((entry) => ({ ...entry, type: 'audio' })),
    ...(manifest.json || []).map((entry) => ({ ...entry, type: 'json' })),
  ].map(transformEntry);
  const results = { images: {}, audio: {}, json: {} };
  let complete = 0;
  const total = entries.length;
  onProgress({ complete, total, file: 'manifest.json' });
  await Promise.all(entries.map(async (entry) => {
    if (delayMs) await wait(delayMs, signal);
    const value = entry.type === 'image' ? await loadImage(entry.url, signal)
      : entry.type === 'audio' ? await loadAudio(entry.url, signal)
      : await loadJson(entry.url, signal);
    results[entry.type === 'image' ? 'images' : entry.type === 'audio' ? 'audio' : 'json'][entry.id] = value;
    complete++;
    onProgress({ complete, total, file: entry.url });
  }));
  return results;
}
