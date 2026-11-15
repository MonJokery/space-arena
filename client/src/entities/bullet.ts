import { Entity } from './entity.ts';
import { createHoming } from '../behaviors.ts';
import type { Vector2 } from '../vector2.ts';
import type { World } from '../world.ts';

export class Bullet extends Entity {
  ownerId: number;
  ttl = 1.9;
  damage: number;
  homing: ReturnType<typeof createHoming> | null;
  constructor({ position, velocity, ownerId, homing = false }: { position: Vector2; velocity: Vector2; ownerId: number; homing?: boolean }) {
    super({ position, velocity, radius: homing ? 6 : 4, kind: 'bullet' });
    this.ownerId = ownerId;
    this.damage = homing ? 30 : 25;
    this.homing = homing ? createHoming({ turnRate: 3.4, speed: 260, targetKind: 'asteroid' }) : null;
  }
  override update(dt: number, world: World): void {
    if (this.homing) this.homing.update(this, world, dt);
    super.update(dt, world);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }
}
