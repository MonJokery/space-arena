import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { encodeInput, decodeInput, encodeSnapshot, decodeSnapshot } from './protocol.ts';
import { createArena, addShip, snapshot, integrate, wrap, advanceArena } from './simulation.ts';
import { entityId, inputSeq } from './types.ts';
import { parseClientMessage } from '../server/src/protocol.ts';

const controls = fc.record({ thrust: fc.boolean(), left: fc.boolean(), right: fc.boolean(),
  brake: fc.boolean(), fire: fc.boolean(), homing: fc.boolean() });

describe('fast-check properties', () => {
  test('1 input packet survives binary roundtrip', () => fc.assert(fc.property(fc.integer({ min: 1, max: 2_000_000 }), controls, (seq, input) => {
    expect(decodeInput(encodeInput({ type:'input', seq: inputSeq(seq), ...input }))).toEqual({ type:'input', seq, ...input });
  }), { numRuns: 150 }));
  test('2 binary packet length matches schema', () => fc.assert(fc.property(fc.integer({ min: 0, max: 15 }), (count) => {
    const arena = createArena({ width: 960, height: 600, asteroids: count }, 4);
    addShip(arena, entityId(9));
    const state = snapshot(arena);
    expect(encodeSnapshot(state).byteLength).toBe(10 + 8 * state.acks.length + 36 * state.entities.length);
  }), { numRuns: 75 }));
  test('3 truncated / broken frame throws without crashing runner', () => fc.assert(fc.property(
    fc.uint8Array({ minLength: 0, maxLength: 7 }), (raw) => {
      expect(() => decodeInput(raw)).toThrow();
    }), { numRuns: 100 }));
  test('4 ship stays in wraparound arena', () => fc.assert(fc.property(
    fc.double({ min: -1e6, max: 1e6, noNaN: true }), fc.double({ min:-1e6, max:1e6, noNaN:true }), (x,y) => {
      const ship = wrap({x,y},960,600);
      expect(ship.x).toBeGreaterThanOrEqual(0); expect(ship.x).toBeLessThan(960);
      expect(ship.y).toBeGreaterThanOrEqual(0); expect(ship.y).toBeLessThan(600);
    }), { numRuns: 250 }));
  test('5 valid messages parse and malformed messages reject', () => fc.assert(fc.property(
    fc.string({ minLength: 1, maxLength: 70 }).filter((s) => s.trim().length > 0), (text) => {
      const valid = parseClientMessage(JSON.stringify({ type: 'chat', text }));
      expect(valid.type).toBe('chat');
      expect(() => parseClientMessage(JSON.stringify({ type: 'chat', text, forged: true }))).toThrow();
    }), { numRuns: 100 }));
  test('6 snapshot roundtrip within float32 and int16 angle tolerance', () => fc.assert(fc.property(
    fc.double({min:-3.0,max:3.0,noNaN:true}), (angle) => {
      const arena = createArena({width:960,height:600,asteroids:0},9);
      const ship = addShip(arena,entityId(2)); ship.angle = angle;
      const after = decodeSnapshot(encodeSnapshot(snapshot(arena)));
      const restored = after.entities.find((e)=>e.id===2)!;
      expect(Math.abs(restored.angle-angle)).toBeLessThan(0.00006);
      expect(Math.abs(restored.x-ship.x)).toBeLessThan(0.0001);
    }), {numRuns:100}));
});

describe('binary boundary validation', () => {
  const valid = encodeInput({type:'input', seq:inputSeq(30), thrust:true});
  for (const [label, offset, value] of [
    ['version',0,99],['kind',1,99],['reserved',7,1],['flags',6,128]
  ] as const) test(`rejects invalid ${label}`, () => {
    const b = valid.slice(0); new DataView(b).setUint8(offset,value);
    expect(() => decodeInput(b)).toThrow();
  });
  for (let length=0;length<8;length++) test(`reject input length ${length}`,()=>expect(()=>decodeInput(valid.slice(0,length))).toThrow());
  const arena=createArena({width:960,height:600,asteroids:4}); addShip(arena,entityId(1));
  const bytes=encodeSnapshot(snapshot(arena));
  for (const size of [0,1,2,5,9,10,12,30,bytes.byteLength-1]) test(`reject snapshot truncated to ${size}`,()=>{
    expect(()=>decodeSnapshot(bytes.slice(0,size))).toThrow();
  });
});
