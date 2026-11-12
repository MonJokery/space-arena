import { Entity } from './entity.js';
import { createHoming } from '../behaviors.js';

export class Bullet extends Entity {
  constructor({ position, velocity, ownerId, homing = false }) {
    super({ position, velocity, radius: homing ? 6 : 4, kind: 'bullet' });
    this.ownerId = ownerId;
    this.ttl = 1.9;
    this.damage = homing ? 30 : 25;
    this.homing = homing ? createHoming({ turnRate: 3.4, speed: 260, targetKind: 'asteroid' }) : null;
  }
  update(dt, world) {
    if (this.homing) this.homing.update(this, world, dt);
    super.update(dt, world);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }
}
