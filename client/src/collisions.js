import { Vector2 } from './vector2.js';
import { emitGameEvent } from './events.js';
export function circlesIntersect(a, b, world) {
  const delta = world.delta(a.position, b.position);
  return delta.x * delta.x + delta.y * delta.y <= (a.radius + b.radius) ** 2;
}

export function processCollisions(world) {
  const objects = [...world.entities.values()].filter((entity) => !entity.dead && entity.kind !== 'particle');
  for (let i = 0; i < objects.length; i++) {
    const a = objects[i];
    if (a.dead) continue;
    for (let j = i + 1; j < objects.length; j++) {
      const b = objects[j];
      if (b.dead || !circlesIntersect(a, b, world)) continue;
      handleCollision(a, b, world);
      if (a.dead) break;
    }
  }
}

function handleCollision(a, b, world) {
  const bullet = a.kind === 'bullet' ? a : b.kind === 'bullet' ? b : null;
  const target = bullet === a ? b : a;
  if (bullet && !bullet.dead && (target.kind === 'asteroid' || target.kind === 'ship')) {
    if (target.id === bullet.ownerId) return;
    if (target.kind === 'ship') {
      if (!target.takeDamage(bullet.damage)) return;
      if (target.dead) world.destroyShip(target);
    } else {
      target.takeDamage(bullet.damage);
      if (target.dead) {
        world.explode(target.position, '#ffc178', 20);
        emitGameEvent('exploded', { kind: 'asteroid' });
        world.award(bullet.ownerId, 10);
      }
    }
    bullet.dead = true;
    emitGameEvent('hit', { target: target.kind });
    world.explode(bullet.position, '#ffe4a5', 6);
    return;
  }
  const ship = a.kind === 'ship' ? a : b.kind === 'ship' ? b : null;
  const other = ship === a ? b : a;
  if (!ship || ship.dead) return;
  if (other.kind === 'pickup') {
    if (other.effect.onContact(other, ship)) {
      world.award(ship.id, 5);
      world.explode(other.position, '#6bffb1', 10);
    }
  } else if (other.kind === 'asteroid') {
    const damage = Math.max(10, Math.min(30, Math.round(other.radius * 0.65)));
    if (!ship.takeDamage(damage)) return;
    const offset = world.delta(other.position, ship.position);
    const distance = offset.length();
    const direction = distance > 0 ? offset.scale(1 / distance) : Vector2.fromAngle(ship.angle);
    ship.position = world.wrap(other.position.add(direction.scale(ship.radius + other.radius + 2)));
    ship.velocity = ship.velocity.add(direction.scale(90));
    world.explode(ship.position, '#6deaff', 12);
    if (ship.dead) world.destroyShip(ship);
  }
}
