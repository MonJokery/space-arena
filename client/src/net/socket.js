import { encodeInput, decodeSnapshot } from '../../../shared/protocol.js';

export class GameSocket extends EventTarget {
  #socket = null;
  #timer = null;
  #queue = [];
  #attempt = 0;
  #stopped = true;
  #joined = false;
  #bytes = 0;
  #lastSecond = performance.now();
  bytesPerSecond = 0;
  rtt = 0;
  constructor(url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`) {
    super(); this.url = url; this.impairment = { delay: 0, jitter: 0, loss: 0 }; this.jsonMode = false;
  }
  connect(name, roomId) {
    this.disconnect(); this.name = name; this.roomId = roomId; this.#stopped = false; this.#open();
  }
  #open() {
    if (this.#stopped) return;
    this.#status('Підключення…');
    const socket = new WebSocket(`${this.url}${this.jsonMode ? '?format=json' : ''}`);
    socket.binaryType = 'arraybuffer'; this.#socket = socket; this.#joined = false;
    socket.addEventListener('open', () => { this.#attempt = 0; socket.send(JSON.stringify({ type: 'join', name: this.name, roomId: this.roomId })); });
    socket.addEventListener('message', (event) => {
      const size = typeof event.data === 'string' ? new TextEncoder().encode(event.data).byteLength : event.data.byteLength;
      this.#bytes += size;
      let message;
      try { message = typeof event.data === 'string' ? JSON.parse(event.data) : decodeSnapshot(event.data); } catch { return; }
      if (message.type === 'pongTime') this.rtt = Math.max(0, performance.now() - message.timestamp);
      if (message.type === 'joined') {
        this.#joined = true; this.#status(`Підключено до ${this.roomId}`);
        while (this.#queue.length && socket.readyState === WebSocket.OPEN) this.#transmit(this.#queue.shift());
      }
      if (message.type === 'snapshot') {
        if (Math.random() * 100 < this.impairment.loss) return;
        const delay = Math.max(0, this.impairment.delay + (Math.random() * 2 - 1) * this.impairment.jitter);
        setTimeout(() => { if (!this.#stopped && this.#socket === socket) this.dispatchEvent(new CustomEvent('message', { detail: message })); }, delay);
      } else this.dispatchEvent(new CustomEvent('message', { detail: message }));
    });
    socket.addEventListener('close', (event) => {
      if (this.#stopped || this.#socket !== socket) return;
      this.#joined = false;
      if ([1008, 1009].includes(event.code)) { this.#status(`З'єднання відхилено: ${event.reason || event.code}`); this.#stopped = true; return; }
      const delay = Math.min(10000, 500 * 2 ** this.#attempt++) + Math.random() * 250;
      this.#status(`Повторне підключення через ${Math.ceil(delay / 1000)} с`);
      this.#timer = setTimeout(() => this.#open(), delay);
    });
    socket.addEventListener('error', () => this.#status('Помилка з’єднання'));
  }
  #transmit(message) {
    if (message.type === 'input' && !this.jsonMode) this.#socket.send(encodeInput(message));
    else this.#socket.send(JSON.stringify(message));
  }
  send(message) {
    if (this.#stopped) return false;
    if (this.#socket?.readyState === WebSocket.OPEN && this.#joined) this.#transmit(message);
    else if (this.#queue.length < 50) this.#queue.push(message);
    else return false;
    return true;
  }
  sendInput(message) {
    if (!this.#joined) return false;
    const delay = Math.max(0, this.impairment.delay + (Math.random() * 2 - 1) * this.impairment.jitter);
    if (Math.random() * 100 < this.impairment.loss) return true;
    const socket = this.#socket;
    setTimeout(() => { if (this.#socket === socket && this.#joined) this.#transmit(message); }, delay);
    return true;
  }
  measure() {
    const now = performance.now(), elapsed = (now - this.#lastSecond) / 1000;
    if (elapsed >= 1) { this.bytesPerSecond = Math.round(this.#bytes / elapsed); this.#bytes = 0; this.#lastSecond = now; }
    if (this.#joined) this.send({ type: 'pingTime', timestamp: now });
  }
  #status(value) { this.dispatchEvent(new CustomEvent('status', { detail: value })); }
  disconnect() {
    this.#stopped = true; this.#joined = false; clearTimeout(this.#timer);
    this.#socket?.close(1000, 'Leaving room'); this.#socket = null; this.#queue = [];
  }
}
