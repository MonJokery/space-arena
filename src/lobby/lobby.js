import { fetchJson, withRetry } from '../async/assets.js';

export class Lobby extends EventTarget {
  #timer = null;
  #controller = null;
  #visible = false;
  constructor({ url = '/api/rooms', intervalMs = 5000, timeoutMs = 2500 } = {}) {
    super(); this.url = url; this.intervalMs = intervalMs; this.timeoutMs = timeoutMs;
  }
  async refresh() {
    if (!this.#visible) return;
    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const signal = AbortSignal.any([controller.signal, timeoutSignal]);
    try {
      const json = await withRetry(() => fetchJson(this.url, { signal }), { signal, attempts: 2 });
      if (!Array.isArray(json.rooms)) throw new Error('У відповіді немає rooms');
      if (this.#visible && !signal.aborted) this.dispatchEvent(new CustomEvent('rooms', { detail: json.rooms }));
    } catch (error) {
      if (this.#visible && !controller.signal.aborted) this.dispatchEvent(new CustomEvent('error', { detail: error.message }));
    }
  }
  show() {
    if (this.#visible) return;
    this.#visible = true;
    void this.refresh();
    this.#timer = setInterval(() => { void this.refresh(); }, this.intervalMs);
  }
  hide() {
    this.#visible = false; clearInterval(this.#timer); this.#timer = null;
    this.#controller?.abort(); this.#controller = null;
  }
  join(name, room) {
    if (!this.#visible || !name.trim() || !room) return false;
    this.hide();
    this.dispatchEvent(new CustomEvent('join', { detail: { name: name.trim(), room } }));
    return true;
  }
}
