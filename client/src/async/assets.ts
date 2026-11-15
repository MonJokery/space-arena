import { z } from 'zod';

export type AssetEntry = { id: string; url: string; type: 'image' | 'audio' | 'json' };
export type LoadProgress = { complete: number; total: number; file: string };
export type Assets = {
  images: Record<string, ImageBitmap | HTMLImageElement>;
  audio: Record<string, AudioBuffer>;
  json: Record<string, unknown>;
};
type Options = { signal?: AbortSignal };
type RetryOptions = Options & { attempts?: number; baseMs?: number };
type FetchOptions = Options & { fetchFn?: typeof fetch };
type LoadingOptions = Options & {
  onProgress?: (progress: LoadProgress) => void;
  manifestUrl?: string;
  transformEntry?: (entry: AssetEntry) => AssetEntry;
  delayMs?: number;
};
const entrySchema = z.object({ id: z.string(), url: z.string() });
const manifestSchema = z.object({ images: z.array(entrySchema).optional(), audio: z.array(entrySchema).optional(), json: z.array(entrySchema).optional() });
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    function abort(): void { clearTimeout(timer); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); }
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export async function withRetry<T>(task: () => Promise<T>, { signal, attempts = 3, baseMs = 250 }: RetryOptions = {}): Promise<T> {
  for (let index = 0; index < attempts; index++) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    try { return await task(); }
    catch (error: unknown) {
      const status = error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 0;
      if (signal?.aborted || error instanceof DOMException && error.name === 'AbortError' || (status >= 400 && status < 500) || index === attempts - 1) throw error;
      await wait(baseMs * 2 ** index + Math.random() * baseMs, signal);
    }
  }
  throw new Error('No retries configured');
}
export async function fetchChecked(url: string, { signal, fetchFn = fetch }: FetchOptions = {}): Promise<Response> {
  const response = await fetchFn(url, { signal, cache: 'no-store' });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${url}`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return response;
}
export async function fetchJson(url: string, options: FetchOptions = {}): Promise<unknown> {
  const response = await fetchChecked(url, options);
  try { return await response.json(); }
  catch { throw new Error(`Некоректний JSON: ${url}`); }
}
export function loadJson(url: string, signal?: AbortSignal): Promise<unknown> {
  return withRetry(() => fetchJson(url, { signal }), { signal });
}
export async function loadImage(url: string, signal?: AbortSignal): Promise<ImageBitmap | HTMLImageElement> {
  return withRetry(async () => {
    const blob = await (await fetchChecked(url, { signal })).blob();
    if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = new Image(); image.src = objectUrl; await image.decode(); return image;
    } finally { URL.revokeObjectURL(objectUrl); }
  }, { signal });
}
export async function loadAudio(url: string, signal?: AbortSignal): Promise<AudioBuffer> {
  return withRetry(async () => {
    const bytes = await (await fetchChecked(url, { signal })).arrayBuffer();
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const decoder = new OfflineAudioContext(1, 44100, 44100);
    return decoder.decodeAudioData(bytes);
  }, { signal });
}
export async function loadAll({ signal, onProgress = () => {}, manifestUrl = '/assets/manifest.json', transformEntry = (entry) => entry, delayMs = 0 }: LoadingOptions = {}): Promise<Assets> {
  const manifest = manifestSchema.parse(await loadJson(manifestUrl, signal));
  const entries: AssetEntry[] = [
    ...(manifest.images ?? []).map((entry): AssetEntry => ({ ...entry, type: 'image' })),
    ...(manifest.audio ?? []).map((entry): AssetEntry => ({ ...entry, type: 'audio' })),
    ...(manifest.json ?? []).map((entry): AssetEntry => ({ ...entry, type: 'json' })),
  ].map(transformEntry);
  const results: Assets = { images: {}, audio: {}, json: {} };
  let complete = 0;
  const total = entries.length;
  onProgress({ complete, total, file: 'manifest.json' });
  await Promise.all(entries.map(async (entry) => {
    if (delayMs) await wait(delayMs, signal);
    switch (entry.type) {
      case 'image': results.images[entry.id] = await loadImage(entry.url, signal); break;
      case 'audio': results.audio[entry.id] = await loadAudio(entry.url, signal); break;
      case 'json': results.json[entry.id] = await loadJson(entry.url, signal); break;
      default: { const neverEntry: never = entry.type; throw new Error(`Unknown asset ${String(neverEntry)}`); }
    }
    complete++;
    onProgress({ complete, total, file: entry.url });
  }));
  return results;
}
