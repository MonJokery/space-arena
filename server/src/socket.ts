import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';
import type { Server, IncomingMessage } from 'node:http';
import { parseClientMessage, MAX_MESSAGE_BYTES } from './protocol.ts';
import type { ParsedClientMessage } from './protocol.ts';
import { decodeInput, encodeSnapshot } from '../../shared/protocol.ts';
import { entityId } from '../../shared/types.ts';
import type { EntityId, InputPacket, Snapshot } from '../../shared/types.ts';
import type { Room, RoomStore, Peer } from './room.ts';
import type { Logger, LogEntry } from './logger.ts';
import { rateLimit } from './rate-limit.ts';
import { recordTick, countTraffic } from './performance.ts';
import { appLog } from './app-log.ts';
import type { Config } from './config.ts';
import { TICK_RATE } from '../../shared/simulation.ts';

const MAX_BUFFER = 128 * 1024;
const MAX_PER_SECOND = 85;
const PERIOD = 1000 / TICK_RATE;
type ConnectedPeer = Peer & {
  socket: WebSocket; ip: string;
  missed: number; lastPong: boolean; windowStart: number; count: number;
};
type ServerMessage = Snapshot | { type: 'players'; players: string[] } | { type: 'joined'; roomId: string; players: string[]; playerId: EntityId; seed: number; tickRate: number } | { type: 'pongTime'; timestamp: number } | { type: 'chat'; name: string; text: string; time: number } | { type: 'gameEvent'; eventType: 'fired' | 'hit' | 'exploded'; id: EntityId };

export function attachSockets(server: Server, rooms: RoomStore, logger: Logger, config: Config, isReady: () => boolean): { close(): Promise<void>; peers: Set<ConnectedPeer> } {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const peers = new Set<ConnectedPeer>();
  const perIp = new Map<string, number>();
  const jsonModes = new WeakMap<WebSocket, boolean>();
  const isConnectedPeer = (peer: Peer): peer is ConnectedPeer => peer.socket instanceof WebSocket;
  const record = (event: LogEntry): void => { void logger.write(event).catch((error: unknown) => console.error('Log error:', error)); };
  const send = (peer: ConnectedPeer, value: ServerMessage | ArrayBuffer, binary = false): boolean => {
    if (peer.socket.readyState !== WebSocket.OPEN || peer.socket.bufferedAmount > MAX_BUFFER) return false;
    const payload = binary && value instanceof ArrayBuffer ? Buffer.from(value) : JSON.stringify(value);
    peer.socket.send(payload); countTraffic('out', Buffer.byteLength(payload));
    return true;
  };
  const broadcast = (room: Room, message: ServerMessage): void => {
    for (const player of room.members) if (isConnectedPeer(player)) send(player, message);
  };
  function leave(peer: ConnectedPeer): void {
    if (!peer.room) return;
    const room = peer.room;
    peer.room = null;
    rooms.leave(room, peer);
    record({ type: 'left', room: room.config.id, name: peer.name });
    appLog.info({ roomId: room.config.id, playerId: peer.playerId }, 'Player left');
    broadcast(room, { type: 'players', players: room.players });
  }
  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const origin = request.headers.origin;
    const ip = request.socket.remoteAddress ?? 'unknown';
    if (!isReady() || url.pathname !== '/ws' || !origin || !config.allowedOrigins.includes(origin) ||
      (perIp.get(ip) ?? 0) >= config.maxConnectionsPerIp) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    const jsonMode = url.searchParams.get('format') === 'json';
    wss.handleUpgrade(request, socket, head, (ws) => {
      jsonModes.set(ws, jsonMode);
      wss.emit('connection', ws, request);
    });
  });
  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const ip = request.socket.remoteAddress ?? 'unknown';
    const peer: ConnectedPeer = { socket, ip, room: null, name: '', missed: 0, lastPong: true, windowStart: Date.now(), count: 0, playerId: entityId(0) };
    peers.add(peer); perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    const deadline = setTimeout(() => socket.close(1008, 'Join timeout'), 5000);
    socket.on('pong', () => { peer.missed = 0; peer.lastPong = true; });
    socket.on('error', (error: Error) => console.error('WebSocket:', error.message));
    socket.on('message', (raw: RawData, isBinary: boolean) => {
      const rawBytes = Array.isArray(raw) ? raw.reduce((total, part) => total + part.byteLength, 0) : raw.byteLength;
      countTraffic('in', rawBytes);
      const now = Date.now();
      const limit = rateLimit(peer.windowStart, peer.count, now, MAX_PER_SECOND);
      peer.windowStart = limit.windowStart; peer.count = limit.count;
      if (!limit.allowed) { socket.close(1008, 'Rate limited'); return; }
      let message: ParsedClientMessage;
      try {
        const bytes = Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? Buffer.from(raw) : Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
        if (isBinary) {
          if (!peer.room || jsonModes.get(socket)) throw new Error('Unexpected binary input');
          message = decodeInput(bytes);
        } else message = parseClientMessage(bytes.toString('utf8'));
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : 'Invalid message';
        appLog.warn({ roomId: peer.room?.config.id, playerId: peer.playerId, reason }, 'Invalid message');
        record({ type: 'invalid_message', reason, room: peer.room?.config.id ?? 'none', name: peer.name });
        socket.close(reason === 'Message too large' ? 1009 : 1008, reason.slice(0, 80));
        return;
      }
      if (!peer.room) {
        if (message.type !== 'join') { socket.close(1008, 'Join required'); return; }
        const room = rooms.getOrCreate(message.roomId);
        if (!room) { socket.close(1008, 'Unknown room'); return; }
        if (room.members.size >= config.maxPlayersPerRoom) { socket.close(1008, 'Room full'); return; }
        clearTimeout(deadline);
        peer.name = message.name; peer.room = room; room.join(peer);
        send(peer, { type: 'joined', roomId: room.config.id, players: room.players, playerId: peer.playerId, seed: room.seed, tickRate: TICK_RATE });
        broadcast(room, { type: 'players', players: room.players });
        record({ type: 'joined', room: room.config.id, name: peer.name });
        appLog.info({ roomId: room.config.id, playerId: peer.playerId }, 'Player joined');
        return;
      }
      switch (message.type) {
        case 'input': peer.room.receiveInput(peer, message); break;
        case 'pingTime': send(peer, { type: 'pongTime', timestamp: message.timestamp }); break;
        case 'chat': {
          const payload: ServerMessage = { type: 'chat', name: peer.name, text: message.text, time: Date.now() };
          broadcast(peer.room, payload);
          record({ type: 'chat', room: peer.room.config.id, name: peer.name, text: message.text });
          appLog.info({ roomId: peer.room.config.id, playerId: peer.playerId }, 'Chat message');
          break;
        }
        case 'leave': socket.close(1000, 'Leaving room'); break;
        case 'join': socket.close(1008, 'Already joined'); break;
        default: {
          const impossible: never = message;
          throw new Error(`Unexpected message ${JSON.stringify(impossible)}`);
        }
      }
    });
    socket.on('close', () => { clearTimeout(deadline); peers.delete(peer); perIp.set(ip, Math.max(0, (perIp.get(ip) ?? 1) - 1)); leave(peer); });
  });
  wss.on('error', (error: Error) => console.error('WebSocket server:', error));
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
  let timer: ReturnType<typeof setTimeout>;
  function tick(): void {
    if (!running) return;
    let now = performance.now();
    let count = 0;
    while (now >= target && count < 5) {
      const tickStart = performance.now();
      for (const room of rooms.active.values()) {
        const { state, events } = room.step();
        for (const player of room.members) {
          if (!isConnectedPeer(player)) continue;
          const peer = player;
          const payload = jsonModes.get(peer.socket) ? state : encodeSnapshot(state);
          send(peer, payload, !jsonModes.get(peer.socket));
          for (const event of events) send(peer, { type: 'gameEvent', eventType: event.type, id: event.id });
        }
      }
      recordTick(performance.now() - tickStart);
      target += PERIOD;
      count++;
      now = performance.now();
    }
    if (count === 5 && now >= target) target = now + PERIOD;
    timer = setTimeout(tick, Math.max(0, target - performance.now()));
  }
  timer = setTimeout(tick, PERIOD);
  async function close(): Promise<void> {
    running = false; clearTimeout(timer); clearInterval(heartbeat);
    for (const peer of [...peers]) {
      if (peer.socket.readyState === WebSocket.OPEN) peer.socket.send(JSON.stringify({ type: 'shutdown', reason: 'Server maintenance' }));
      peer.socket.close(1001, 'Server shutdown');
    }
    await Promise.race([
      new Promise<void>(resolve => wss.close(() => resolve())),
      new Promise<void>(resolve => setTimeout(() => { for (const peer of peers) peer.socket.terminate(); resolve(); }, 2500)),
    ]);
  }
  return { close, peers };
}
