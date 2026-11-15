import { createArena, addShip, advanceArena, snapshot } from '../../shared/simulation.js';
import { EventEmitter } from 'node:events';

export const TEMPLATES = [
  { id: 'training', name: 'Тренувальна арена', width: 960, height: 600, asteroids: 5 },
  { id: 'belt', name: 'Астероїдний пояс', width: 1100, height: 700, asteroids: 9 },
  { id: 'tiny', name: 'Мала арена', width: 720, height: 480, asteroids: 4 },
];

export class Room extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.members = new Set();
    this.seed = 197711 + [...config.id].reduce((n, c) => n + c.charCodeAt(0), 0);
    this.arena = createArena(config, this.seed);
    this.nextPlayerId = 1;
    this.inputs = new Map();
    this.acks = new Map();
    this.on('error', (error) => console.error(`Room ${this.config.id}:`, error));
  }
  join(peer) {
    peer.playerId = this.nextPlayerId++;
    this.members.add(peer);
    addShip(this.arena, peer.playerId);
    this.inputs.set(peer.playerId, {});
    this.acks.set(peer.playerId, 0);
    this.emit('joined', { room: this.config.id, name: peer.name });
  }
  leave(peer) {
    if (!this.members.delete(peer)) return;
    this.arena.entities.delete(peer.playerId);
    this.inputs.delete(peer.playerId);
    this.acks.delete(peer.playerId);
    this.emit('left', { room: this.config.id, name: peer.name });
  }
  receiveInput(peer, input) {
    if (input.seq <= (this.acks.get(peer.playerId) ?? 0)) return;
    if (input.seq > (this.acks.get(peer.playerId) ?? 0) + 200) return;
    this.inputs.set(peer.playerId, input);
    this.acks.set(peer.playerId, input.seq);
  }
  step() {
    const events = advanceArena(this.arena, this.inputs);
    return { state: snapshot(this.arena, this.acks), events };
  }
  get players() { return [...this.members].map((peer) => peer.name); }
}

export class RoomStore {
  constructor(templates = TEMPLATES) {
    this.templates = new Map(templates.map((room) => [room.id, room]));
    this.active = new Map();
  }
  list() {
    return [...this.templates.values()].map((room) => ({ ...room, players: this.active.get(room.id)?.members.size ?? 0 }));
  }
  create(config) {
    if (this.templates.has(config.id)) return null;
    this.templates.set(config.id, config);
    return config;
  }
  getOrCreate(id) {
    const template = this.templates.get(id);
    if (!template) return null;
    let room = this.active.get(id);
    if (!room) { room = new Room(template); this.active.set(id, room); }
    return room;
  }
  leave(room, peer) {
    room.leave(peer);
    if (room.members.size === 0) this.active.delete(room.config.id);
  }
}
