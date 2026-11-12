import { Entity } from './entity.js';
import { createHoming } from '../behaviors.js';

export class Asteroid extends Entity {
  constructor({ position, velocity, radius = 26, homing = false }) {
    super({ position, velocity, radius, kind: 'asteroid' });
    this.hp = homing ? 75 : 50;
    this.homing = homing ? createHoming({ targetKind: 'ship', turnRate: 0.48, speed: 57 }) : null;
    this.angle = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - 0.5) * 0.8;
  }
  update(dt, world) {
    if (this.homing) this.homing.update(this, world, dt);
    super.update(dt, world);
    this.angle += this.spin * dt;
  }
  takeDamage(damage) {
    this.hp -= damage;
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }
}
