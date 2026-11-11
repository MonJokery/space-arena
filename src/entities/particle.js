import { Entity } from './entity.js';

export class Particle extends Entity {
  constructor({ position, velocity, color, ttl }) {
    super({ position, velocity, kind: 'particle', radius: 2 });
    this.color = color;
    this.ttl = ttl;
    this.maxTtl = ttl;
  }
  update(dt, world) {
    super.update(dt, world);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }
}
