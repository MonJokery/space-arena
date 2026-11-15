export const VERSION = 1;
export const KIND = { ship: 1, bullet: 2, asteroid: 3, pickup: 4 };
export const TYPES = { INPUT: 1, SNAPSHOT: 2 };
const angle16 = (angle) => Math.round(Math.atan2(Math.sin(angle), Math.cos(angle)) / Math.PI * 32767);
export function encodeInput({ seq, thrust = false, left = false, right = false, brake = false, fire = false, homing = false }) {
  const buffer = new ArrayBuffer(8), v = new DataView(buffer);
  v.setUint8(0, VERSION); v.setUint8(1, TYPES.INPUT);
  v.setUint32(2, seq, true);
  v.setUint8(6, (thrust ? 1 : 0) | (left ? 2 : 0) | (right ? 4 : 0) | (brake ? 8 : 0) | (fire ? 16 : 0) | (homing ? 32 : 0));
  v.setUint8(7, 0);
  return buffer;
}
export function decodeInput(buffer) {
  const v = new DataView(toBuffer(buffer));
  if (v.byteLength !== 8 || v.getUint8(0) !== VERSION || v.getUint8(1) !== TYPES.INPUT || v.getUint8(7) !== 0 || v.getUint8(6) & 192) throw new Error('Invalid input packet');
  const flags = v.getUint8(6);
  return { type: 'input', seq: v.getUint32(2, true), thrust: !!(flags & 1), left: !!(flags & 2), right: !!(flags & 4), brake: !!(flags & 8), fire: !!(flags & 16), homing: !!(flags & 32) };
}
function toBuffer(data) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  throw new Error('Invalid binary data');
}
export function encodeSnapshot(snapshot) {
  const entities = snapshot.entities, acks = snapshot.acks || [];
  if (entities.length > 1000 || acks.length > 100) throw new Error('Snapshot too big');
  const buf = new ArrayBuffer(10 + acks.length * 8 + entities.length * 36), v = new DataView(buf);
  v.setUint8(0, VERSION); v.setUint8(1, TYPES.SNAPSHOT); v.setUint32(2, snapshot.tick, true);
  v.setUint16(6, entities.length, true); v.setUint16(8, acks.length, true);
  let p = 10;
  for (const [id, seq] of acks) { v.setUint32(p, id, true); v.setUint32(p + 4, seq, true); p += 8; }
  for (const e of entities) {
    v.setUint32(p, e.id, true); v.setUint8(p + 4, KIND[e.kind]); v.setUint8(p + 5, e.homing ? 1 : 0);
    v.setInt16(p + 6, angle16(e.angle || 0), true);
    for (const [index, value] of [e.x, e.y, e.vx, e.vy].entries()) v.setFloat32(p + 8 + index * 4, value, true);
    v.setUint16(p + 24, Math.max(0, Math.min(65535, Math.round(e.radius || 0))), true);
    v.setInt16(p + 26, Math.max(-32768, Math.min(32767, Math.round(e.hp || 0))), true);
    v.setUint16(p + 28, Math.max(0, Math.min(65535, Math.round(e.score || 0))), true);
    v.setUint16(p + 30, Math.max(0, Math.min(65535, Math.round(e.deaths || 0))), true);
    v.setUint32(p + 32, e.owner || 0, true);
    p += 36;
  }
  return buf;
}
export function decodeSnapshot(raw) {
  const v = new DataView(toBuffer(raw));
  if (v.byteLength < 10 || v.getUint8(0) !== VERSION || v.getUint8(1) !== TYPES.SNAPSHOT) throw new Error('Invalid snapshot');
  const count = v.getUint16(6, true), countAcks = v.getUint16(8, true);
  if (v.byteLength !== 10 + countAcks * 8 + count * 36) throw new Error('Wrong snapshot length');
  let p = 10;
  const acks = [];
  for (let i = 0; i < countAcks; i++) { acks.push([v.getUint32(p, true), v.getUint32(p + 4, true)]); p += 8; }
  const names = Object.fromEntries(Object.entries(KIND).map(([key, value]) => [value, key]));
  const entities = [];
  for (let i = 0; i < count; i++) {
    const kind = names[v.getUint8(p + 4)];
    if (!kind) throw new Error('Invalid entity kind');
    entities.push({ id: v.getUint32(p, true), kind, homing: !!v.getUint8(p + 5), angle: v.getInt16(p + 6, true) / 32767 * Math.PI, x: v.getFloat32(p + 8, true), y: v.getFloat32(p + 12, true), vx: v.getFloat32(p + 16, true), vy: v.getFloat32(p + 20, true), radius: v.getUint16(p + 24, true), hp: v.getInt16(p + 26, true), score: v.getUint16(p + 28, true), deaths: v.getUint16(p + 30, true), owner: v.getUint32(p + 32, true) });
    p += 36;
  }
  return { type: 'snapshot', tick: v.getUint32(2, true), acks, entities };
}
