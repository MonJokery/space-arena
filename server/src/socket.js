import { WebSocketServer, WebSocket } from 'ws';
import { parseMessage, MAX_MESSAGE_BYTES } from './protocol.js';

const MAX_BUFFER = 128 * 1024;
const MAX_PER_SECOND = 20;

export function attachSockets(server, rooms, logger) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const peers = new Set();
  const record = (event) => logger.write(event).catch((error) => console.error('Log error:', error));
  const send = (socket, value) => {
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_BUFFER) return false;
    socket.send(JSON.stringify(value));
    return true;
  };
  function broadcast(room, message) {
    for (const peer of room.members) send(peer.socket, message);
  }
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
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws));
  });
  wss.on('connection', (socket) => {
    const peer = { socket, room: null, name: null, missed: 0, lastPong: true, windowStart: Date.now(), count: 0 };
    peers.add(peer);
    const deadline = setTimeout(() => socket.close(1008, 'Join timeout'), 5000);
    socket.on('pong', () => { peer.missed = 0; peer.lastPong = true; });
    socket.on('error', (error) => console.error('WebSocket:', error.message));
    socket.on('message', (raw) => {
      const now = Date.now();
      if (now - peer.windowStart >= 1000) { peer.windowStart = now; peer.count = 0; }
      if (++peer.count > MAX_PER_SECOND) { socket.close(1008, 'Rate limited'); return; }
      let message;
      try { message = parseMessage(raw); }
      catch (error) { socket.close(error.message === 'Message too large' ? 1009 : 1008, error.message); return; }
      if (!peer.room) {
        if (message.type !== 'join') { socket.close(1008, 'Join required'); return; }
        const room = rooms.getOrCreate(message.roomId);
        if (!room) { socket.close(1008, 'Unknown room'); return; }
        clearTimeout(deadline);
        peer.name = message.name;
        peer.room = room;
        room.join(peer);
        send(socket, { type: 'joined', roomId: room.config.id, players: room.players });
        broadcast(room, { type: 'players', players: room.players });
        record({ type: 'joined', room: room.config.id, name: peer.name });
        return;
      }
      if (message.type === 'chat') {
        const payload = { type: 'chat', name: peer.name, text: message.text, time: Date.now() };
        broadcast(peer.room, payload);
        record({ type: 'chat', room: peer.room.config.id, name: peer.name, text: message.text });
      } else if (message.type === 'leave') {
        socket.close(1000, 'Leaving room');
      } else { socket.close(1008, 'Already joined'); }
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
  async function close() {
    clearInterval(heartbeat);
    for (const peer of [...peers]) { leave(peer); peer.socket.terminate(); }
    await new Promise((resolve) => wss.close(resolve));
  }
  return { close, peers };
}
