import { Vector2 } from './vector2.js';
export function createHoming({ turnRate = 2.5, speed = 150, targetKind = 'ship' } = {}) {
  return {
    update(owner, world, dt) {
      let target = null;
      let nearest = Infinity;
      for (const candidate of world.ofKind(targetKind)) {
        if (candidate.dead || candidate.id === owner.id || candidate.id === owner.ownerId) continue;
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
export function createPickup({ heal = 30 } = {}) {
  return {
    onContact(owner, ship) {
      if (owner.dead || ship.dead || ship.hp <= 0) return false;
      if (ship.heal(heal) === 0) return false;
      owner.dead = true;
      return true;
    },
  };
}
