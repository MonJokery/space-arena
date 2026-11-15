import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, rng, spawnShip, integrate, wrap, createArena, addShip, advanceArena, snapshot } from '../../shared/simulation.js';
import { encodeInput, decodeInput, encodeSnapshot, decodeSnapshot } from '../../shared/protocol.js';
import { Room } from '../src/room.js';

test('LCG is reproducible', () => {
  const a = rng(987), b = rng(987);
  assert.deepEqual(Array.from({ length: 100 }, a), Array.from({ length: 100 }, b));
});
test('same input produces same position after 300 steps', () => {
  let a = spawnShip(1, 960, 600), b = spawnShip(1, 960, 600);
  for (let i = 0; i < 300; i++) {
    const command = { thrust: i % 3 !== 0, left: i % 10 < 4, right: i % 10 > 7, brake: i % 25 === 0 };
    a = wrap(integrate(a, command, DT), 960, 600);
    b = wrap(integrate(b, command, DT), 960, 600);
  }
  assert.deepEqual(a, b);
});
test('input binary protocol little-endian and flags', () => {
  const command = { seq: 0x12345678, thrust: true, right: true, fire: true, homing: false };
  const data = encodeInput(command);
  assert.equal(data.byteLength, 8);
  assert.deepEqual([...new Uint8Array(data).slice(2, 6)], [0x78, 0x56, 0x34, 0x12]);
  const decoded = decodeInput(data);
  assert.equal(decoded.seq, command.seq);
  assert.equal(decoded.fire, true);
  assert.equal(decoded.right, true);
  assert.equal(decoded.left, false);
});
test('invalid input protocol rejected', () => {
  const bytes = new Uint8Array(encodeInput({ seq: 1 }));
  bytes[0] = 42;
  assert.throws(() => decodeInput(bytes), /Invalid/);
  assert.throws(() => decodeInput(new Uint8Array(5)), /Invalid/);
});
test('snapshot binary round trip and compact size', () => {
  const arena = createArena({ width: 960, height: 600, asteroids: 4 }, 42);
  addShip(arena, 1);
  const state = snapshot(arena, new Map([[1, 78]]));
  const binary = encodeSnapshot(state);
  const decoded = decodeSnapshot(binary);
  assert.equal(decoded.tick, state.tick);
  assert.deepEqual(decoded.acks, [[1, 78]]);
  assert.equal(decoded.entities.length, state.entities.length);
  assert.ok(Math.abs(decoded.entities[0].x - state.entities[0].x) < 0.01);
  assert.ok(binary.byteLength < Buffer.byteLength(JSON.stringify(state)));
});
test('server computes ship from input, not client coordinates', () => {
  const room = new Room({ id: 'test', width: 960, height: 600, asteroids: 0 });
  const peer = { name: 'Pilot' };
  room.join(peer);
  const before = room.arena.entities.get(peer.playerId).y;
  room.receiveInput(peer, { seq: 1, thrust: true, x: 999999 });
  const state = room.step().state;
  assert.ok(state.entities.find((e) => e.id === peer.playerId).y < before);
  assert.notEqual(state.entities.find((e) => e.id === peer.playerId).x, 999999);
  assert.equal(state.acks[0][1], 1);
});
test('ship death respawns after 2 seconds', () => {
  const arena = createArena({ width: 960, height: 600, asteroids: 0 });
  const ship = addShip(arena, 1);
  ship.hp = 0;
  ship.respawn = 2;
  for (let i = 0; i < 61; i++) advanceArena(arena);
  assert.equal(ship.hp, 100);
});
