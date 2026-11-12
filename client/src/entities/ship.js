import { Entity } from './entity.js';
import { Bullet } from './bullet.js';
import { Vector2 } from '../vector2.js';
import { integrate } from '../physics.js';
import { emitGameEvent } from '../events.js';

export class Ship extends Entity {
  #hp = 100;
  constructor({ position, angle = -Math.PI / 2 } = {}) {
    super({ position, radius: 17, kind: 'ship' });
    this.angle = angle;
    this.input = { thrust: false, left: false, right: false, brake: false };
    this.cooldown = 0;
    this.invulnerable = 1.5;
    this.score = 0;
    this.thrusting = false;
  }
  get hp() { return this.#hp; }
  update(dt, world) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.thrusting = this.input.thrust;
    const next = integrate({ x: this.position.x, y: this.position.y, vx: this.velocity.x, vy: this.velocity.y, angle: this.angle }, this.input, dt);
    this.position = world.wrap(new Vector2(next.x, next.y));
    this.velocity = new Vector2(next.vx, next.vy);
    this.angle = next.angle;
  }
  fire(world, homing = false) {
    if (this.dead || this.cooldown > 0) return null;
    const direction = Vector2.fromAngle(this.angle);
    const position = world.wrap(this.position.add(direction.scale(this.radius + 10)));
    const velocity = this.velocity.add(direction.scale(homing ? 260 : 440));
    const bullet = new Bullet({ position, velocity, ownerId: this.id, homing });
    world.spawn(bullet);
    emitGameEvent('fired', { ownerId: this.id });
    this.cooldown = homing ? 0.48 : 0.17;
    return bullet;
  }
  takeDamage(damage) {
    if (this.dead || this.invulnerable > 0) return false;
    this.#hp = Math.max(0, this.#hp - damage);
    this.invulnerable = 1.2;
    if (this.#hp === 0) this.dead = true;
    return true;
  }
  heal(amount) { const added = Math.min(100 - this.#hp, amount); this.#hp += added; return added; }
}
