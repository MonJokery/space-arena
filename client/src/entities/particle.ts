import { Entity } from './entity.ts';
import type { Vector2 } from '../vector2.ts';
import type { World } from '../world.ts';

export class Particle extends Entity {
  color: string;
  ttl: number;
  maxTtl: number;
  constructor({ position, velocity, color, ttl }: { position: Vector2; velocity: Vector2; color: string; ttl: number }) {
    super({ position, velocity, kind: 'particle', radius: 2 });
    this.color = color;
    this.ttl = ttl;
    this.maxTtl = ttl;
  }
  override update(dt: number, world: World): void {
    super.update(dt, world);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }
}
