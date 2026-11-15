import { encodeInput, decodeSnapshot } from '../../../shared/protocol.ts';
import { parseServerMessage } from '../../../shared/network.ts';
import type { ServerMessage, OutgoingMessage } from '../../../shared/network.ts';
import type { InputPacket } from '../../../shared/types.ts';

type Impairment = { delay: number; jitter: number; loss: number };
export class GameSocket extends EventTarget {
  #socket: WebSocket | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #queue: OutgoingMessage[] = [];
  #attempt = 0;
  #stopped = true;
  #joined = false;
  #bytes = 0;
  #lastSecond = performance.now();
  bytesPerSecond = 0;
  rtt = 0;
  readonly url: string;
  impairment: Impairment = { delay: 0, jitter: 0, loss: 0 };
  jsonMode = false;
  name = '';
  roomId = '';
  constructor(url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`) {
    super(); this.url = url;
  }
  connect(name: string, roomId: string): void {
    this.disconnect(); this.name = name; this.roomId = roomId; this.#stopped = false; this.#open();
  }
  #open(): void {
    if (this.#stopped) return;
    this.#status('Підключення…');
    const socket = new WebSocket(`${this.url}${this.jsonMode ? '?format=json' : ''}`);
    socket.binaryType = 'arraybuffer'; this.#socket = socket; this.#joined = false;
    socket.addEventListener('open', () => { this.#attempt = 0; socket.send(JSON.stringify({ type: 'join', name: this.name, roomId: this.roomId })); });
    socket.addEventListener('message', (event: MessageEvent<string | ArrayBuffer>) => {
      const size = typeof event.data === 'string' ? new TextEncoder().encode(event.data).byteLength : event.data.byteLength;
      this.#bytes += size;
      let message: ServerMessage;
      try {
        const raw: unknown = typeof event.data === 'string' ? JSON.parse(event.data) : null;
        message = typeof event.data === 'string' ? parseServerMessage(raw) : decodeSnapshot(event.data);
      } catch { return; }
      if (message.type === 'pongTime') this.rtt = Math.max(0, performance.now() - message.timestamp);
      if (message.type === 'joined') {
        this.#joined = true; this.#status(`Підключено до ${this.roomId}`);
        while (this.#queue.length && socket.readyState === WebSocket.OPEN) {
          const queued = this.#queue.shift();
          if (queued) this.#transmit(queued);
        }
      }
      if (message.type === 'snapshot') {
        if (Math.random() * 100 < this.impairment.loss) return;
        const delay = Math.max(0, this.impairment.delay + (Math.random() * 2 - 1) * this.impairment.jitter);
        setTimeout(() => { if (!this.#stopped && this.#socket === socket) this.#message(message); }, delay);
      } else this.#message(message);
    });
    socket.addEventListener('close', (event: CloseEvent) => {
      if (this.#stopped || this.#socket !== socket) return;
      this.#joined = false;
      if ([1008, 1009].includes(event.code)) { this.#status(`З'єднання відхилено: ${event.reason || event.code}`); this.#stopped = true; return; }
      const delay = Math.min(10000, 500 * 2 ** this.#attempt++) + Math.random() * 250;
      this.#status(`Повторне підключення через ${Math.ceil(delay / 1000)} с`);
      this.#timer = setTimeout(() => this.#open(), delay);
    });
    socket.addEventListener('error', () => this.#status('Помилка з’єднання'));
  }
  #transmit(message: OutgoingMessage): void {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) return;
    if (message.type === 'input' && !this.jsonMode) this.#socket.send(encodeInput(message));
    else this.#socket.send(JSON.stringify(message));
  }
  send(message: OutgoingMessage): boolean {
    if (this.#stopped) return false;
    if (this.#socket?.readyState === WebSocket.OPEN && this.#joined) this.#transmit(message);
    else if (this.#queue.length < 50) this.#queue.push(message);
    else return false;
    return true;
  }
  sendInput(message: InputPacket): boolean {
    if (!this.#joined) return false;
    const delay = Math.max(0, this.impairment.delay + (Math.random() * 2 - 1) * this.impairment.jitter);
    if (Math.random() * 100 < this.impairment.loss) return true;
    const socket = this.#socket;
    setTimeout(() => { if (this.#socket === socket && this.#joined) this.#transmit(message); }, delay);
    return true;
  }
  measure(): void {
    const now = performance.now(), elapsed = (now - this.#lastSecond) / 1000;
    if (elapsed >= 1) { this.bytesPerSecond = Math.round(this.#bytes / elapsed); this.#bytes = 0; this.#lastSecond = now; }
    if (this.#joined) this.send({ type: 'pingTime', timestamp: now });
  }
  #message(message: ServerMessage): void { this.dispatchEvent(new CustomEvent<ServerMessage>('message', { detail: message })); }
  #status(value: string): void { this.dispatchEvent(new CustomEvent<string>('status', { detail: value })); }
  disconnect(): void {
    this.#stopped = true; this.#joined = false;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#socket?.close(1000, 'Leaving room'); this.#socket = null; this.#queue = [];
  }
}
