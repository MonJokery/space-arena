import { emitGameEvent } from './events.js';
import { Vector2 } from './vector2.js';
import { processCollisions } from './collisions.js';
import { Particle } from './entities/particle.js';
import { Ship } from './entities/ship.js';

export class World {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.entities = new Map();
    this.pending = [];
    this.respawns = [];
    this.playerId = null;
    this.score = 0;
    this.deaths = 0;
  }
  spawn(entity) { this.pending.push(entity); return entity; }
  despawn(id) {
    const entity = this.entities.get(id) || this.pending.find((item) => item.id === id);
    if (entity) entity.dead = true;
  }
  *ofKind(kind) {
    for (const entity of this.entities.values()) if (entity.kind === kind && !entity.dead) yield entity;
  }
  [Symbol.iterator]() { return this.entities.values(); }
  flush() {
    for (const entity of this.pending) if (!entity.dead) this.entities.set(entity.id, entity);
    this.pending.length = 0;
  }
  sweep() {
    for (const [id, entity] of this.entities) if (entity.dead) this.entities.delete(id);
  }
  delta(from, to) {
    let x = to.x - from.x;
    let y = to.y - from.y;
    if (Math.abs(x) > this.width / 2) x -= Math.sign(x) * this.width;
    if (Math.abs(y) > this.height / 2) y -= Math.sign(y) * this.height;
    return new Vector2(x, y);
  }
  wrap(position) {
    return new Vector2(((position.x % this.width) + this.width) % this.width, ((position.y % this.height) + this.height) % this.height);
  }
  get player() { return this.entities.get(this.playerId) || null; }
  award(id, points) { if (id === this.playerId) { this.score += points; const ship = this.player; if (ship) ship.score = this.score; } }
  explode(position, color = '#ffc178', count = 14) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.25;
      const speed = 40 + Math.random() * 135;
      this.spawn(new Particle({ position, velocity: Vector2.fromAngle(angle).scale(speed), color, ttl: 0.25 + Math.random() * 0.55 }));
    }
  }
  destroyShip(ship) {
    if (!ship.dead) ship.dead = true;
    if (this.respawns.some((item) => item.id === ship.id)) return;
    this.explode(ship.position, '#6deaff', 30);
    emitGameEvent('exploded', { kind: 'ship' });
    this.deaths++;
    this.respawns.push({ id: ship.id, time: 2 });
  }
  resetPlayer() {
    if (this.player) this.despawn(this.playerId);
    this.respawns.length = 0;
    const ship = this.spawn(new Ship({ position: new Vector2(this.width / 2, this.height / 2) }));
    this.playerId = ship.id;
    this.flush();
    return ship;
  }
  step(dt) {
    this.flush();
    for (const entity of this.entities.values()) {
      if (entity.dead) continue;
      entity.previousPosition = entity.position;
      entity.update(dt, this);
    }
    this.flush(); // нові кулі, створені під час кроку
    processCollisions(this);
    this.sweep();
    for (const item of this.respawns) item.time -= dt;
    const due = this.respawns.filter((item) => item.time <= 0);
    this.respawns = this.respawns.filter((item) => item.time > 0);
    for (const item of due) {
      if (this.playerId !== item.id) continue;
      const ship = this.spawn(new Ship({ position: new Vector2(this.width / 2, this.height / 2) }));
      ship.score = this.score;
      this.playerId = ship.id;
    }
    this.flush();
  }
}
