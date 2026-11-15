import { WebSocketServer, WebSocket } from 'ws';
import { parseMessage, MAX_MESSAGE_BYTES } from './protocol.js';
import { decodeInput, encodeSnapshot } from '../../shared/protocol.js';
import { TICK_RATE } from '../../shared/simulation.js';

const MAX_BUFFER = 128 * 1024;
const MAX_PER_SECOND = 85;
const PERIOD = 1000 / TICK_RATE;

export function attachSockets(server, rooms, logger) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const peers = new Set();
  const record = (event) => logger.write(event).catch((error) => console.error('Log error:', error));
  const send = (peer, value, binary = false) => {
    if (peer.socket.readyState !== WebSocket.OPEN || peer.socket.bufferedAmount > MAX_BUFFER) return false;
    peer.socket.send(binary ? value : JSON.stringify(value));
    return true;
  };
  const broadcast = (room, message) => { for (const peer of room.members) send(peer, message); };
  function leave(peer) {
    if (!peer.room) return;
    const room = peer.room;
    peer.room = null;
    rooms.leave(room, peer);
    record({ type: 'left', room: room.config.id, name: peer.name });
    broadcast(room, { type: 'players', players: room.players });
  }
  server.on('upgrade', (request, socket, head) => {
    if (new URL(request.url, 'http://localhost').pathname !== '/ws') { socket.destroy(); return; }
    const jsonMode = new URL(request.url, 'http://localhost').searchParams.get('format') === 'json';
    wss.handleUpgrade(request, socket, head, (ws) => { ws.jsonMode = jsonMode; wss.emit('connection', ws); });
  });
  wss.on('connection', (socket) => {
    const peer = { socket, room: null, name: null, missed: 0, lastPong: true, windowStart: Date.now(), count: 0, playerId: 0 };
    peers.add(peer);
    const deadline = setTimeout(() => socket.close(1008, 'Join timeout'), 5000);
    socket.on('pong', () => { peer.missed = 0; peer.lastPong = true; });
    socket.on('error', (error) => console.error('WebSocket:', error.message));
    socket.on('message', (raw, isBinary) => {
      const now = Date.now();
      if (now - peer.windowStart >= 1000) { peer.windowStart = now; peer.count = 0; }
      if (++peer.count > MAX_PER_SECOND) { socket.close(1008, 'Rate limited'); return; }
      let message;
      try {
        if (isBinary) {
          if (!peer.room || socket.jsonMode) throw new Error('Unexpected binary input');
          message = decodeInput(raw);
        } else message = parseMessage(raw);
      } catch (error) { socket.close(error.message === 'Message too large' ? 1009 : 1008, error.message.slice(0, 80)); return; }
      if (!peer.room) {
        if (message.type !== 'join') { socket.close(1008, 'Join required'); return; }
        const room = rooms.getOrCreate(message.roomId);
        if (!room) { socket.close(1008, 'Unknown room'); return; }
        clearTimeout(deadline);
        peer.name = message.name; peer.room = room; room.join(peer);
        send(peer, { type: 'joined', roomId: room.config.id, players: room.players, playerId: peer.playerId, seed: room.seed, tickRate: TICK_RATE });
        broadcast(room, { type: 'players', players: room.players });
        record({ type: 'joined', room: room.config.id, name: peer.name });
        return;
      }
      if (message.type === 'input') {
        peer.room.receiveInput(peer, message);
      } else if (message.type === 'pingTime') {
        send(peer, { type: 'pongTime', timestamp: message.timestamp });
      } else if (message.type === 'chat') {
        const payload = { type: 'chat', name: peer.name, text: message.text, time: Date.now() };
        broadcast(peer.room, payload);
        record({ type: 'chat', room: peer.room.config.id, name: peer.name, text: message.text });
      } else if (message.type === 'leave') socket.close(1000, 'Leaving room');
      else socket.close(1008, 'Already joined');
    });
    socket.on('close', () => { clearTimeout(deadline); peers.delete(peer); leave(peer); });
  });
  wss.on('error', (error) => console.error('WebSocket server:', error));
  const heartbeat = setInterval(() => {
    for (const peer of peers) {
      if (!peer.lastPong) peer.missed++;
      if (peer.missed >= 2) { peer.socket.terminate(); continue; }
      peer.lastPong = false;
      if (peer.socket.readyState === WebSocket.OPEN) peer.socket.ping();
    }
  }, 15000);
  let running = true;
  let target = performance.now() + PERIOD;
  let timer;
  function tick() {
    if (!running) return;
    let now = performance.now();
    let count = 0;
    while (now >= target && count < 5) {
      for (const room of rooms.active.values()) {
        const { state, events } = room.step();
        for (const peer of room.members) {
          const payload = peer.socket.jsonMode ? state : encodeSnapshot(state);
          send(peer, payload, !peer.socket.jsonMode);
          for (const event of events) send(peer, { type: 'gameEvent', eventType: event.type, id: event.id });
        }
      }
      target += PERIOD;
      count++;
      now = performance.now();
    }
    if (count === 5 && now >= target) target = now + PERIOD;
    timer = setTimeout(tick, Math.max(0, target - performance.now()));
  }
  timer = setTimeout(tick, PERIOD);
  async function close() {
    running = false; clearTimeout(timer); clearInterval(heartbeat);
    for (const peer of [...peers]) { leave(peer); peer.socket.terminate(); }
    await new Promise((resolve) => wss.close(resolve));
  }
  return { close, peers };
}
