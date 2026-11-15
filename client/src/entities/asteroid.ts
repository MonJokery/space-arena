import { Entity } from './entity.ts';
import { createHoming } from '../behaviors.ts';
import type { Vector2 } from '../vector2.ts';
import type { World } from '../world.ts';

export class Asteroid extends Entity {
  hp: number;
  homing: ReturnType<typeof createHoming> | null;
  angle: number;
  spin: number;
  constructor({ position, velocity, radius = 26, homing = false }: { position: Vector2; velocity: Vector2; radius?: number; homing?: boolean }) {
    super({ position, velocity, radius, kind: 'asteroid' });
    this.hp = homing ? 75 : 50;
    this.homing = homing ? createHoming({ targetKind: 'ship', turnRate: 0.48, speed: 57 }) : null;
    this.angle = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - 0.5) * 0.8;
  }
  override update(dt: number, world: World): void {
    if (this.homing) this.homing.update(this, world, dt);
    super.update(dt, world);
    this.angle += this.spin * dt;
  }
  takeDamage(damage: number): boolean {
    this.hp -= damage;
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }
}
