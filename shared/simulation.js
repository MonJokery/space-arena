export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const cloneState = (s) => ({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, angle: s.angle });
export function rng(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}
export function spawnShip(id, width, height) {
  return { id, kind: 'ship', x: width / 2, y: height / 2, vx: 0, vy: 0, angle: -Math.PI / 2, radius: 18, hp: 100, score: 0, deaths: 0, invulnerable: 2, cooldown: 0, respawn: 0 };
}
export function integrate(ship, input, dt = DT) {
  const angle = ship.angle + (Number(!!input.right) - Number(!!input.left)) * 3.4 * dt;
  const acceleration = input.thrust ? 300 : 0;
  let vx = (ship.vx + Math.cos(angle) * acceleration * dt) * Math.exp(-(input.brake ? 3.8 : 0.32) * dt);
  let vy = (ship.vy + Math.sin(angle) * acceleration * dt) * Math.exp(-(input.brake ? 3.8 : 0.32) * dt);
  const speed = Math.hypot(vx, vy);
  if (speed > 380) { vx = vx / speed * 380; vy = vy / speed * 380; }
  return { ...ship, angle, vx, vy, x: ship.x + vx * dt, y: ship.y + vy * dt };
}
export function wrap(s, width, height) {
  return { ...s, x: ((s.x % width) + width) % width, y: ((s.y % height) + height) % height };
}
export function distanceSquared(a, b, width, height) {
  let dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  dx = Math.min(dx, width - dx); dy = Math.min(dy, height - dy);
  return dx * dx + dy * dy;
}
export function createArena({ width, height, asteroids = 5 }, seed = 12345) {
  const random = rng(seed);
  const entities = new Map();
  for (let i = 0; i < asteroids; i++) {
    const a = 2 * Math.PI * i / Math.max(asteroids, 1);
    const radius = 18 + 7 * (i % 3);
    const id = 1000 + i;
    entities.set(id, { id, kind: 'asteroid', x: width * (0.5 + 0.34 * Math.cos(a)), y: height * (0.5 + 0.34 * Math.sin(a)), vx: (random() - 0.5) * 36, vy: (random() - 0.5) * 36, angle: random() * Math.PI * 2, radius, hp: Math.ceil(radius / 9), homing: i === 0 });
  }
  for (let i = 0; i < 2; i++) {
    const id = 2000 + i;
    entities.set(id, { id, kind: 'pickup', x: width * (i ? 0.8 : 0.2), y: height * (i ? 0.3 : 0.7), vx: 0, vy: 0, angle: 0, radius: 13, hp: 1 });
  }
  return { width, height, tick: 0, seed, entities, nextId: 3000 };
}
export function addShip(arena, id) {
  const count = [...arena.entities.values()].filter((e) => e.kind === 'ship').length;
  const ship = spawnShip(id, arena.width, arena.height);
  ship.x = arena.width * (0.3 + (count % 3) * 0.2);
  ship.y = arena.height * (0.38 + (count % 2) * 0.2);
  arena.entities.set(id, ship);
  return ship;
}
export function advanceArena(arena, inputs = new Map()) {
  const { width, height } = arena;
  arena.tick++;
  const events = [];
  for (const entity of [...arena.entities.values()]) {
    if (entity.kind === 'ship') {
      if (entity.hp <= 0) {
        entity.respawn -= DT;
        if (entity.respawn <= 0) Object.assign(entity, { ...spawnShip(entity.id, width, height), score: entity.score, deaths: entity.deaths });
        continue;
      }
      const input = inputs.get(entity.id) ?? {};
      entity.invulnerable = Math.max(0, entity.invulnerable - DT);
      entity.cooldown = Math.max(0, entity.cooldown - DT);
      Object.assign(entity, wrap(integrate(entity, input), width, height));
      if (input.fire && entity.cooldown === 0) {
        const id = arena.nextId++;
        arena.entities.set(id, { id, kind: 'bullet', owner: entity.id, x: (entity.x + Math.cos(entity.angle) * 24 + width) % width, y: (entity.y + Math.sin(entity.angle) * 24 + height) % height, vx: entity.vx + Math.cos(entity.angle) * 510, vy: entity.vy + Math.sin(entity.angle) * 510, angle: entity.angle, radius: 5, ttl: 1.3, hp: 1, homing: !!input.homing });
        entity.cooldown = 0.23;
        events.push({ type: 'fired', id: entity.id });
      }
    } else if (entity.kind === 'bullet') {
      entity.ttl -= DT;
      if (entity.ttl <= 0) { arena.entities.delete(entity.id); continue; }
      if (entity.homing) {
        const target = [...arena.entities.values()].find((other) => other.kind === 'asteroid');
        if (target) {
          const dx = target.x - entity.x, dy = target.y - entity.y;
          const a = Math.atan2(dy, dx);
          entity.vx = entity.vx * 0.95 + Math.cos(a) * 510 * 0.05;
          entity.vy = entity.vy * 0.95 + Math.sin(a) * 510 * 0.05;
        }
      }
      Object.assign(entity, wrap({ ...entity, x: entity.x + entity.vx * DT, y: entity.y + entity.vy * DT }, width, height));
    } else if (entity.kind === 'asteroid') {
      if (entity.homing) {
        const ship = [...arena.entities.values()].find((other) => other.kind === 'ship' && other.hp > 0);
        if (ship) {
          const a = Math.atan2(ship.y - entity.y, ship.x - entity.x);
          entity.vx = entity.vx * 0.99 + Math.cos(a) * 30 * 0.01;
          entity.vy = entity.vy * 0.99 + Math.sin(a) * 30 * 0.01;
        }
      }
      Object.assign(entity, wrap({ ...entity, x: entity.x + entity.vx * DT, y: entity.y + entity.vy * DT, angle: entity.angle + DT * 0.15 }, width, height));
    }
  }
  const values = [...arena.entities.values()];
  for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) {
    const a = values[i], b = values[j];
    if (!arena.entities.has(a.id) || !arena.entities.has(b.id)) continue;
    if (distanceSquared(a, b, width, height) > (a.radius + b.radius) ** 2) continue;
    const bullet = a.kind === 'bullet' ? a : b.kind === 'bullet' ? b : null;
    const victim = bullet === a ? b : a;
    if (bullet && ['ship', 'asteroid'].includes(victim.kind) && bullet.owner !== victim.id) {
      if (victim.kind === 'ship' && victim.invulnerable > 0) continue;
      arena.entities.delete(bullet.id);
      victim.hp -= victim.kind === 'ship' ? 20 : 1;
      if (victim.kind === 'ship') victim.invulnerable = 0.5;
      events.push({ type: 'hit', id: victim.id });
      if (victim.hp <= 0) {
        if (victim.kind === 'ship') { victim.hp = 0; victim.respawn = 2; victim.deaths++; }
        else arena.entities.delete(victim.id);
        const owner = arena.entities.get(bullet.owner);
        if (owner?.kind === 'ship') owner.score += victim.kind === 'ship' ? 50 : 10;
        events.push({ type: 'exploded', id: victim.id });
      }
    } else {
      const ship = a.kind === 'ship' ? a : b.kind === 'ship' ? b : null;
      const other = ship === a ? b : a;
      if (!ship || ship.hp <= 0) continue;
      if (other.kind === 'pickup') {
        ship.hp = Math.min(100, ship.hp + 30);
        arena.entities.delete(other.id);
        ship.score += 5;
      } else if (other.kind === 'asteroid' && ship.invulnerable <= 0) {
        ship.hp = Math.max(0, ship.hp - Math.round(other.radius * 0.65));
        ship.invulnerable = 1.2;
        ship.vx *= -0.5; ship.vy *= -0.5;
        events.push({ type: 'hit', id: ship.id });
        if (!ship.hp) { ship.respawn = 2; ship.deaths++; events.push({ type: 'exploded', id: ship.id }); }
      }
    }
  }
  return events;
}
export function snapshot(arena, acks = new Map()) {
  return { type: 'snapshot', tick: arena.tick, entities: [...arena.entities.values()].map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, vx: e.vx, vy: e.vy, angle: e.angle, radius: e.radius, hp: e.hp ?? 0, score: e.score ?? 0, deaths: e.deaths ?? 0, homing: !!e.homing, invulnerable: e.invulnerable ?? 0, owner: e.owner ?? 0 })), acks: [...acks] };
}
