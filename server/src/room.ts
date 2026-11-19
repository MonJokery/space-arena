import { createArena, addShip, advanceArena, snapshot } from '../../shared/simulation.ts';
import { entityId, inputSeq } from '../../shared/types.ts';
import type { Arena, EntityId, InputSeq, Controls, GameEvent, Snapshot } from '../../shared/types.ts';
import type { RoomConfig } from './protocol.ts';
import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';

export type Peer = { playerId: EntityId; name: string; room: Room | null; socket?: WebSocket; };
export type RoomEvent = { room: string; name: string };
export interface Room {
  on(event: 'joined' | 'left', listener: (payload: RoomEvent) => void): this;
  emit(event: 'joined' | 'left', payload: RoomEvent): boolean;
  on(event: 'error', listener: (error: Error) => void): this;
  emit(event: 'error', error: Error): boolean;
}
export const TEMPLATES: RoomConfig[] = [
  { id: 'training', name: 'Тренувальна арена', width: 960, height: 600, asteroids: 5 },
  { id: 'belt', name: 'Астероїдний пояс', width: 1100, height: 700, asteroids: 9 },
  { id: 'tiny', name: 'Мала арена', width: 720, height: 480, asteroids: 4 },
];
export class Room extends EventEmitter {
  readonly config: RoomConfig;
  readonly members = new Set<Peer>();
  readonly seed: number;
  readonly arena: Arena;
  nextPlayerId = 1;
  readonly inputs = new Map<EntityId, Controls>();
  readonly acks = new Map<EntityId, InputSeq>();
  constructor(config: RoomConfig) {
    super();
    this.config = config;
    this.seed = 197711 + [...config.id].reduce((n, c) => n + c.charCodeAt(0), 0);
    this.arena = createArena(config, this.seed);
    this.on('error', (error) => console.error(`Room ${this.config.id}:`, error));
  }
  join(peer: Peer): void {
    peer.playerId = entityId(this.nextPlayerId++);
    this.members.add(peer);
    addShip(this.arena, peer.playerId);
    this.inputs.set(peer.playerId, {});
    this.acks.set(peer.playerId, inputSeq(0));
    this.emit('joined', { room: this.config.id, name: peer.name });
  }
  leave(peer: Peer): void {
    if (!this.members.delete(peer)) return;
    this.arena.entities.delete(peer.playerId);
    this.inputs.delete(peer.playerId);
    this.acks.delete(peer.playerId);
    this.emit('left', { room: this.config.id, name: peer.name });
  }
  receiveInput(peer: Peer, input: Controls & { seq: InputSeq }): void {
    if (input.seq <= (this.acks.get(peer.playerId) ?? 0)) return;
    if (input.seq > (this.acks.get(peer.playerId) ?? 0) + 200) return;
    this.inputs.set(peer.playerId, input);
    this.acks.set(peer.playerId, input.seq);
  }
  step(): { state: Snapshot; events: GameEvent[] } {
    const events = advanceArena(this.arena, this.inputs);
    return { state: snapshot(this.arena, this.acks), events };
  }
  get players(): string[] { return [...this.members].map((peer) => peer.name); }
}
export class RoomStore {
  constructorLimits = { rooms: 64, players: 16 };
  setLimits(rooms: number, players: number): void { this.constructorLimits = { rooms, players }; }
  readonly templates: Map<string, RoomConfig>;
  readonly active = new Map<string, Room>();
  constructor(templates: RoomConfig[] = TEMPLATES) {
    this.templates = new Map(templates.map((room) => [room.id, room]));
  }
  list(): (RoomConfig & { players: number })[] {
    return [...this.templates.values()].map((room) => ({ ...room, players: this.active.get(room.id)?.members.size ?? 0 }));
  }
  create(config: RoomConfig): RoomConfig | null {
    if (this.templates.has(config.id) || this.templates.size >= this.constructorLimits.rooms) return null;
    this.templates.set(config.id, config);
    return config;
  }
  getOrCreate(id: string): Room | null {
    const template = this.templates.get(id);
    if (!template) return null;
    let room = this.active.get(id);
    if (!room) { if (this.active.size >= this.constructorLimits.rooms) return null; room = new Room(template); this.active.set(id, room); }
    return room;
  }
  leave(room: Room, peer: Peer): void {
    room.leave(peer);
    if (room.members.size === 0) this.active.delete(room.config.id);
  }
}
