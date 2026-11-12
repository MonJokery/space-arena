export class GameSocket extends EventTarget {
  #socket = null;
  #timer = null;
  #queue = [];
  #attempt = 0;
  #stopped = true;
  constructor(url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`) {
    super();
    this.url = url;
  }
  connect(name, roomId) {
    this.disconnect();
    this.name = name;
    this.roomId = roomId;
    this.#stopped = false;
    this.#open();
  }
  #open() {
    if (this.#stopped) return;
    this.#status('Підключення…');
    const socket = new WebSocket(this.url);
    this.#socket = socket;
    socket.addEventListener('open', () => {
      this.#attempt = 0;
      socket.send(JSON.stringify({ type: 'join', name: this.name, roomId: this.roomId }));
    });
    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'joined') {
        this.#status(`Підключено до ${this.roomId}`);
        while (this.#queue.length && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(this.#queue.shift()));
      }
      this.dispatchEvent(new CustomEvent('message', { detail: message }));
    });
    socket.addEventListener('close', (event) => {
      if (this.#stopped || this.#socket !== socket) return;
      if ([1008, 1009].includes(event.code)) {
        this.#status(`З'єднання відхилено: ${event.reason || event.code}`);
        this.#stopped = true;
        return;
      }
      const delay = Math.min(10000, 500 * 2 ** this.#attempt++) + Math.random() * 250;
      this.#status(`З'єднання втрачено. Повтор через ${Math.ceil(delay / 1000)} с`);
      this.#timer = setTimeout(() => this.#open(), delay);
    });
    socket.addEventListener('error', () => this.#status('Помилка з’єднання'));
  }
  send(message) {
    if (this.#stopped) return false;
    if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(message));
    else if (this.#queue.length < 50) this.#queue.push(message);
    else return false;
    return true;
  }
  #status(value) { this.dispatchEvent(new CustomEvent('status', { detail: value })); }
  disconnect() {
    this.#stopped = true;
    clearTimeout(this.#timer);
    this.#socket?.close(1000, 'Leaving room');
    this.#socket = null;
    this.#queue = [];
  }
}
