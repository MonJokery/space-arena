export type Brand<T, B extends string> = T & { readonly __brand: B };
export type EntityId = Brand<number, 'EntityId'>;
export type Tick = Brand<number, 'Tick'>;
export type InputSeq = Brand<number, 'InputSeq'>;

export interface Vector2 { readonly x: number; readonly y: number }
export type Kind = 'ship' | 'bullet' | 'asteroid' | 'pickup';
export interface Motion extends Vector2 {
  x: number; y: number;
  vx: number;
  vy: number;
  angle: number;
}
export interface BaseEntity extends Motion {
  id: EntityId;
  radius: number;
  hp: number;
}
export interface ShipEntity extends BaseEntity {
  kind: 'ship';
  score: number;
  deaths: number;
  invulnerable: number;
  cooldown: number;
  respawn: number;
}
export interface BulletEntity extends BaseEntity {
  kind: 'bullet';
  owner: EntityId;
  ttl: number;
  homing: boolean;
}
export interface AsteroidEntity extends BaseEntity {
  kind: 'asteroid';
  homing: boolean;
}
export interface PickupEntity extends BaseEntity {
  kind: 'pickup';
}
export type Entity = ShipEntity | BulletEntity | AsteroidEntity | PickupEntity;

export type SnapshotFields = {
  id: EntityId; x: number; y: number; vx: number; vy: number;
  angle: number; radius: number; hp: number; score: number; deaths: number;
  homing: boolean; invulnerable: number; owner: EntityId;
};
export type SnapshotEntity = SnapshotFields & (
  { kind: 'ship' } | { kind: 'bullet' } | { kind: 'asteroid' } | { kind: 'pickup' }
);
export type Snapshot = { type: 'snapshot'; tick: Tick; entities: SnapshotEntity[]; acks: [EntityId, InputSeq][] };
export interface Controls {
  thrust?: boolean; left?: boolean; right?: boolean; brake?: boolean;
  fire?: boolean; homing?: boolean;
}
export type InputPacket = Controls & { type: 'input'; seq: InputSeq };
export type ArenaConfig = { id?: string; name?: string; width: number; height: number; asteroids?: number };
export interface Arena {
  width: number; height: number; tick: Tick; seed: number;
  entities: Map<EntityId, Entity>; nextId: number;
}
export type GameEvent = { type: 'fired' | 'hit' | 'exploded'; id: EntityId };
export function entityId(value: number): EntityId {
  if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new RangeError('Invalid entity ID');
  return value as EntityId; // Branded ID is validated at the boundary.
}
export function inputSeq(value: number): InputSeq {
  if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new RangeError('Invalid input seq');
  return value as InputSeq; // Branded sequence is validated at the boundary.
}
export function tickNumber(value: number): Tick {
  if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new RangeError('Invalid tick');
  return value as Tick; // Branded tick is validated at the boundary.
}
export function assertNever(value: never): never { throw new Error(`Unhandled type: ${JSON.stringify(value)}`); }
