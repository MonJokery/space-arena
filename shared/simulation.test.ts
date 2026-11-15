import { test } from 'node:test';
import { deepStrictEqual, strictEqual, throws } from 'node:assert';
import { createArena, addShip, advanceArena, integrate, DT, snapshot } from './simulation.ts';
import { entityId, inputSeq } from './types.ts';
import { encodeInput, decodeInput, encodeSnapshot, decodeSnapshot } from './protocol.ts';

test('deterministic arena and physics', () => {
  const a = createArena({ width: 960, height: 600 }, 123);
  const b = createArena({ width: 960, height: 600 }, 123);
  addShip(a, entityId(1)); addShip(b, entityId(1));
  for (let i = 0; i < 150; i++) {
    const input = new Map([[entityId(1), { thrust: true, right: i % 3 === 0, fire: i % 12 === 0 }]]);
    advanceArena(a, input); advanceArena(b, input);
  }
  deepStrictEqual(snapshot(a), snapshot(b));
  const ship = addShip(createArena({ width: 800, height: 600 }), entityId(2));
  deepStrictEqual(integrate(ship, {}, DT), integrate(ship, {}, DT));
});
test('binary roundtrip and invalid packets', () => {
  const packet = encodeInput({ type: 'input', seq: inputSeq(45), thrust: true, fire: true });
  strictEqual(decodeInput(packet).seq, 45);
  throws(() => decodeInput(new Uint8Array([1, 1])), /Invalid/);
  const zeroSeq = new DataView(packet.slice(0));
  zeroSeq.setUint32(2, 0, true);
  throws(() => decodeInput(zeroSeq), /Invalid/);
  const a = createArena({ width: 960, height: 600 }); addShip(a, entityId(1));
  const bytes = encodeSnapshot(snapshot(a));
  strictEqual(decodeSnapshot(bytes).entities.length, snapshot(a).entities.length);
  const corrupted = new Uint8Array(bytes.slice(0)); corrupted[0] = 88;
  throws(() => decodeSnapshot(corrupted), /Invalid/);
  const badFloat = new DataView(bytes.slice(0));
  badFloat.setFloat32(18, NaN, true);
  throws(() => decodeSnapshot(badFloat), /Invalid/);
});
