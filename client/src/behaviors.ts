import { Vector2 } from './vector2.ts';
import type { Entity } from './entities/entity.ts';
import type { Ship } from './entities/ship.ts';
import type { World } from './world.ts';

export function createHoming({ turnRate = 2.5, speed = 150, targetKind = 'ship' }: { turnRate?: number; speed?: number; targetKind?: string } = {}) {
  return {
    update(owner: Entity, world: World, dt: number): void {
      let target: Entity | null = null;
      let nearest = Infinity;
      for (const candidate of world.ofKind(targetKind)) {
        const owned = 'ownerId' in owner && typeof owner.ownerId === 'number' && candidate.id === owner.ownerId;
        if (candidate.dead || candidate.id === owner.id || owned) continue;
        const delta = world.delta(owner.position, candidate.position);
        const distance = delta.length();
        if (distance < nearest) { nearest = distance; target = candidate; }
      }
      if (!target) return;
      const wanted = world.delta(owner.position, target.position).normalize();
      const current = owner.velocity.normalize();
      const blend = Math.min(1, turnRate * dt);
      const direction = current.scale(1 - blend).add(wanted.scale(blend)).normalize();
      owner.velocity = (direction.length() ? direction : new Vector2(1, 0)).scale(speed);
    },
  };
}
export function createPickup({ heal = 30 }: { heal?: number } = {}) {
  return {
    onContact(owner: Entity, ship: Ship): boolean {
      if (owner.dead || ship.dead || ship.hp <= 0) return false;
      if (ship.heal(heal) === 0) return false;
      owner.dead = true;
      return true;
    },
  };
}
