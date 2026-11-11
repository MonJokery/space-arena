import test from 'node:test';
import assert from 'node:assert/strict';
import { integrate, wrapShip, makeShip, STEP } from './physics.js';

test('integrate не змінює початковий об’єкт', () => {
  const ship = makeShip(800, 600);
  const copy = { ...ship };
  const next = integrate(ship, { thrust: true, left: false, right: false, brake: false }, STEP);
  assert.deepEqual(ship, copy);
  assert.notDeepEqual(next, ship);
});
test('wrapShip переносить корабель за межами арени', () => {
  const ship = { x: 810, y: -5, vx: 1, vy: 2, angle: 0 };
  const wrapped = wrapShip(ship, 800, 600);
  assert.equal(wrapped.x, 10);
  assert.equal(wrapped.y, 595);
});
test('без керування нерухомий корабель залишається на місці', () => {
  const ship = makeShip(800, 600);
  const next = integrate(ship, { thrust: false, left: false, right: false, brake: false }, STEP);
  assert.equal(next.x, ship.x);
  assert.equal(next.y, ship.y);
});
