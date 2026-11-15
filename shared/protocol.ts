import { entityId, inputSeq, tickNumber, assertNever } from './types.ts';
import type { InputPacket, Snapshot, SnapshotEntity, Kind } from './types.ts';

export const VERSION = 1;
export const KIND = { ship: 1, bullet: 2, asteroid: 3, pickup: 4 };
export const TYPES = { INPUT: 1, SNAPSHOT: 2 };
const angle16 = (angle: number): number => Math.round(Math.atan2(Math.sin(angle), Math.cos(angle)) / Math.PI * 32767);
const uint16 = (n: number): number => Math.max(0, Math.min(65535, Math.round(n)));
const uint32 = (n: number): number => n >>> 0;
function finite(n: number): number {
  if (!Number.isFinite(n)) throw new Error('Invalid float in packet');
  return n;
}
function view(raw: ArrayBuffer | ArrayBufferView): DataView {
  if (raw instanceof ArrayBuffer) return new DataView(raw);
  return new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
}
function decodeKind(value: number): Kind {
  switch (value) {
    case 1: return 'ship';
    case 2: return 'bullet';
    case 3: return 'asteroid';
    case 4: return 'pickup';
    default: throw new Error('Invalid entity kind');
  }
}
export function encodeInput({ seq, thrust = false, left = false, right = false, brake = false, fire = false, homing = false }: InputPacket): ArrayBuffer {
  const buffer = new ArrayBuffer(8), v = new DataView(buffer);
  v.setUint8(0, VERSION); v.setUint8(1, TYPES.INPUT);
  v.setUint32(2, seq, true);
  v.setUint8(6, (thrust ? 1 : 0) | (left ? 2 : 0) | (right ? 4 : 0) | (brake ? 8 : 0) | (fire ? 16 : 0) | (homing ? 32 : 0));
  v.setUint8(7, 0);
  return buffer;
}
export function decodeInput(raw: ArrayBuffer | ArrayBufferView): InputPacket {
  const v = view(raw);
  if (v.byteLength !== 8 || v.getUint8(0) !== VERSION || v.getUint8(1) !== TYPES.INPUT || v.getUint8(7) !== 0 || (v.getUint8(6) & 192)) throw new Error('Invalid input packet');
  const flags = v.getUint8(6);
  const sequence = v.getUint32(2, true);
  if (sequence === 0) throw new Error('Invalid input sequence');
  return { type: 'input', seq: inputSeq(sequence), thrust: !!(flags & 1), left: !!(flags & 2), right: !!(flags & 4), brake: !!(flags & 8), fire: !!(flags & 16), homing: !!(flags & 32) };
}
export function encodeSnapshot(snapshot: Snapshot): ArrayBuffer {
  const { entities, acks } = snapshot;
  if (entities.length > 1000 || acks.length > 100) throw new Error('Snapshot too big');
  const buf = new ArrayBuffer(10 + acks.length * 8 + entities.length * 36), v = new DataView(buf);
  v.setUint8(0, VERSION); v.setUint8(1, TYPES.SNAPSHOT); v.setUint32(2, snapshot.tick, true);
  v.setUint16(6, entities.length, true); v.setUint16(8, acks.length, true);
  let p = 10;
  for (const [id, seq] of acks) { v.setUint32(p, id, true); v.setUint32(p + 4, seq, true); p += 8; }
  for (const e of entities) {
    let kind: number;
    switch (e.kind) {
      case 'ship': case 'bullet': case 'asteroid': case 'pickup': kind = KIND[e.kind]; break;
      default: assertNever(e);
    }
    v.setUint32(p, uint32(e.id), true); v.setUint8(p + 4, kind); v.setUint8(p + 5, e.homing ? 1 : 0);
    v.setInt16(p + 6, angle16(e.angle), true);
    for (const [index, value] of [e.x, e.y, e.vx, e.vy].entries()) v.setFloat32(p + 8 + index * 4, finite(value), true);
    v.setUint16(p + 24, uint16(e.radius), true);
    v.setInt16(p + 26, Math.max(-32768, Math.min(32767, Math.round(e.hp))), true);
    v.setUint16(p + 28, uint16(e.score), true);
    v.setUint16(p + 30, uint16(e.deaths), true);
    v.setUint32(p + 32, uint32(e.owner), true);
    p += 36;
  }
  return buf;
}
export function decodeSnapshot(raw: ArrayBuffer | ArrayBufferView): Snapshot {
  const v = view(raw);
  if (v.byteLength < 10 || v.getUint8(0) !== VERSION || v.getUint8(1) !== TYPES.SNAPSHOT) throw new Error('Invalid snapshot');
  const count = v.getUint16(6, true), countAcks = v.getUint16(8, true);
  if (count > 1000 || countAcks > 100 || v.byteLength !== 10 + countAcks * 8 + count * 36) throw new Error('Wrong snapshot length');
  let p = 10;
  const acks: Snapshot['acks'] = [];
  for (let i = 0; i < countAcks; i++) { acks.push([entityId(v.getUint32(p, true)), inputSeq(v.getUint32(p + 4, true))]); p += 8; }
  const entities: SnapshotEntity[] = [];
  for (let i = 0; i < count; i++) {
    const flags = v.getUint8(p + 5);
    if (flags & 254) throw new Error('Invalid entity flags');
    const x = finite(v.getFloat32(p + 8, true)), y = finite(v.getFloat32(p + 12, true));
    const vx = finite(v.getFloat32(p + 16, true)), vy = finite(v.getFloat32(p + 20, true));
    const radius = v.getUint16(p + 24, true);
    const hp = v.getInt16(p + 26, true);
    if ([x,y,vx,vy].some((n) => Math.abs(n) > 1_000_000) || radius > 2048 || hp < 0) throw new Error('Invalid entity ranges');
    entities.push({ id: entityId(v.getUint32(p, true)), kind: decodeKind(v.getUint8(p + 4)), homing: !!flags, angle: v.getInt16(p + 6, true) / 32767 * Math.PI, x, y, vx, vy, radius, hp, score: v.getUint16(p + 28, true), deaths: v.getUint16(p + 30, true), owner: entityId(v.getUint32(p + 32, true)), invulnerable: 0 });
    p += 36;
  }
  return { type: 'snapshot', tick: tickNumber(v.getUint32(2, true)), acks, entities };
}
