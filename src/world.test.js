import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector2 } from './vector2.js';
import { Entity } from './entities/entity.js';
import { Ship } from './entities/ship.js';
import { Asteroid } from './entities/asteroid.js';
import { Bullet } from './entities/bullet.js';
import { Pickup } from './entities/pickup.js';
import { World } from './world.js';
import { circlesIntersect } from './collisions.js';
import { createHoming } from './behaviors.js';

const still = { thrust: false, left: false, right: false, brake: false };

test('Vector2 не мутує вектори', () => {
  const a = new Vector2(3, 4); const b = new Vector2(2, 1);
  assert.deepEqual(a.add(b), new Vector2(5, 5));
  assert.deepEqual(a.subtract(b), new Vector2(1, 3));
  assert.deepEqual(a.scale(2), new Vector2(6, 8));
  assert.equal(a.length(), 5);
  assert.deepEqual(a, new Vector2(3, 4));
  assert.deepEqual(b, new Vector2(2, 1));
});

test('Entity має унікальний id і Ship успадковує Entity', () => {
  const a = new Entity(); const b = new Ship();
  assert.notEqual(a.id, b.id);
  assert.ok(b instanceof Entity);
  assert.equal(b.hp, 100);
});

test('World spawn, ofKind, despawn, sweep та ітерація', () => {
  const world = new World(400, 300);
  const first = world.spawn(new Asteroid({ position: new Vector2(100, 100), velocity: new Vector2() }));
  world.spawn(new Pickup({ position: new Vector2(250, 250) }));
  world.step(1 / 60);
  assert.equal([...world.ofKind('asteroid')].length, 1);
  assert.equal([...world].length, 2);
  world.despawn(first.id);
  assert.equal([...world.ofKind('asteroid')].length, 0);
  world.step(1 / 60);
  assert.ok(!world.entities.has(first.id));
});

test('Куля спливає після TTL', () => {
  const world = new World(400, 300);
  const bullet = world.spawn(new Bullet({ position: new Vector2(200, 150), velocity: new Vector2(), ownerId: -1 }));
  for (let i = 0; i < 130; i++) world.step(1 / 60);
  assert.equal(world.entities.has(bullet.id), false);
});

test('Колізія враховує загортання країв', () => {
  const world = new World(400, 300);
  const a = new Entity({ position: new Vector2(4, 100), radius: 9 });
  const b = new Entity({ position: new Vector2(397, 100), radius: 9 });
  assert.equal(circlesIntersect(a, b, world), true);
});

test('Ship.fire створює кулю з носа корабля і cooldown', () => {
  const world = new World(400, 300);
  const ship = world.resetPlayer();
  const bullet = ship.fire(world);
  assert.ok(bullet instanceof Bullet);
  assert.equal(bullet.ownerId, ship.id);
  assert.ok(bullet.position.y < ship.position.y);
  assert.equal(ship.fire(world), null);
});

test('Куля б’є астероїд і нараховує очки', () => {
  const world = new World(400, 300);
  const ship = world.resetPlayer();
  const asteroid = world.spawn(new Asteroid({ position: new Vector2(200, 70), velocity: new Vector2(), radius: 20 }));
  world.spawn(new Bullet({ position: new Vector2(200, 70), velocity: new Vector2(), ownerId: ship.id }));
  world.spawn(new Bullet({ position: new Vector2(200, 70), velocity: new Vector2(), ownerId: ship.id }));
  world.step(1 / 60);
  assert.equal(world.entities.has(asteroid.id), false);
  assert.equal(world.score, 10);
});

test('Pickup лікує пошкоджений корабель і зникає', () => {
  const world = new World(400, 300);
  const ship = world.resetPlayer();
  ship.invulnerable = 0;
  ship.takeDamage(50);
  const pickup = world.spawn(new Pickup({ position: ship.position, heal: 30 }));
  ship.input = still;
  world.step(1 / 60);
  assert.equal(ship.hp, 80);
  assert.equal(world.entities.has(pickup.id), false);
  assert.equal(world.score, 5);
});

test('Після смерті корабель респауниться через 2 секунди', () => {
  const world = new World(400, 300);
  const ship = world.resetPlayer();
  ship.invulnerable = 0;
  ship.takeDamage(100);
  world.destroyShip(ship);
  world.step(1);
  assert.equal(world.player, null);
  world.step(1.02);
  assert.ok(world.player instanceof Ship);
  assert.equal(world.player.hp, 100);
  assert.equal(world.deaths, 1);
});

test('Homing-компонент повертає кулю в бік цілі', () => {
  const world = new World(400, 300);
  const asteroid = world.spawn(new Asteroid({ position: new Vector2(230, 180), velocity: new Vector2() }));
  const bullet = world.spawn(new Bullet({ position: new Vector2(100, 180), velocity: new Vector2(0, -100), ownerId: -1 }));
  world.flush();
  const behavior = createHoming({ targetKind: 'asteroid', speed: 100, turnRate: 5 });
  behavior.update(bullet, world, 0.1);
  assert.ok(bullet.velocity.x > 0);
  assert.ok(world.entities.has(asteroid.id));
});

test('Блокова функція this: відв’язаний метод втрачає контекст', () => {
  const world = new World(400, 300);
  const ship = world.resetPlayer();
  const unbound = ship.fire;
  assert.throws(() => unbound(world), TypeError);
  assert.ok(unbound.bind(ship)(world) instanceof Bullet);
});


test('Шкода від астероїда залежить від радіуса, повторні удари мають затримку', () => {
  for (const [radius, expectedDamage] of [[18, 12], [32, 21]]) {
    const world = new World(400, 300);
    const ship = world.resetPlayer();
    ship.invulnerable = 0;
    ship.input = still;
    world.spawn(new Asteroid({ position: ship.position, velocity: new Vector2(), radius }));
    world.step(1 / 60);
    assert.equal(ship.hp, 100 - expectedDamage);
    const afterFirstHit = ship.hp;
    world.step(1 / 60);
    assert.equal(ship.hp, afterFirstHit);
    assert.ok(ship.position.x !== 200 || ship.position.y !== 150);
  }
});
