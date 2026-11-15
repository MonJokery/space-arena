import { z } from 'zod';
import { fetchJson, withRetry } from '../async/assets.ts';

export const RoomSchema = z.object({ id: z.string(), name: z.string(), width: z.number(), height: z.number(), asteroids: z.number(), players: z.number().optional() });
export const RoomsSchema = z.object({ rooms: z.array(RoomSchema) });
export type RoomInfo = z.infer<typeof RoomSchema>;
export type JoinDetail = { name: string; room: RoomInfo };
export class Lobby extends EventTarget {
  #timer: ReturnType<typeof setInterval> | null = null;
  #controller: AbortController | null = null;
  #visible = false;
  readonly url: string;
  readonly intervalMs: number;
  readonly timeoutMs: number;
  constructor({ url = '/api/rooms', intervalMs = 5000, timeoutMs = 2500 }: { url?: string; intervalMs?: number; timeoutMs?: number } = {}) {
    super(); this.url = url; this.intervalMs = intervalMs; this.timeoutMs = timeoutMs;
  }
  async refresh(): Promise<void> {
    if (!this.#visible) return;
    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const signal = AbortSignal.any([controller.signal, timeoutSignal]);
    try {
      const json = RoomsSchema.parse(await withRetry(() => fetchJson(this.url, { signal }), { signal, attempts: 2 }));
      if (this.#visible && !signal.aborted) this.dispatchEvent(new CustomEvent<RoomInfo[]>('rooms', { detail: json.rooms }));
    } catch (error: unknown) {
      if (this.#visible && !controller.signal.aborted) this.dispatchEvent(new CustomEvent<string>('error', { detail: error instanceof Error ? error.message : String(error) }));
    }
  }
  show(): void {
    if (this.#visible) return;
    this.#visible = true;
    void this.refresh();
    this.#timer = setInterval(() => { void this.refresh(); }, this.intervalMs);
  }
  hide(): void {
    this.#visible = false;
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    this.#controller?.abort(); this.#controller = null;
  }
  join(name: string, room: RoomInfo | undefined): boolean {
    if (!this.#visible || !name.trim() || !room) return false;
    this.hide();
    this.dispatchEvent(new CustomEvent<JoinDetail>('join', { detail: { name: name.trim(), room } }));
    return true;
  }
}
