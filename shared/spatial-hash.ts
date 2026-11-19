import type { Arena, Entity } from './types.ts';
const CELL = 80;
export function collisionPairs(arena: Arena): [Entity, Entity][] {
  const columns = Math.max(1, Math.ceil(arena.width / CELL));
  const rows = Math.max(1, Math.ceil(arena.height / CELL));
  const buckets = new Map<number, Entity[]>();
  const result: [Entity, Entity][] = [];
  const seen = new Set<string>();
  for (const entity of arena.entities.values()) {
    const minX = Math.floor((entity.x - entity.radius) / CELL);
    const maxX = Math.floor((entity.x + entity.radius) / CELL);
    const minY = Math.floor((entity.y - entity.radius) / CELL);
    const maxY = Math.floor((entity.y + entity.radius) / CELL);
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      const key = ((y % rows + rows) % rows) * columns + ((x % columns + columns) % columns);
      let bucket = buckets.get(key);
      if (!bucket) { bucket = []; buckets.set(key, bucket); }
      bucket.push(entity);
    }
  }
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) for (let j = i + 1; j < bucket.length; j++) {
      const a = bucket[i]!; const b = bucket[j]!;
      const low = Math.min(a.id, b.id), high = Math.max(a.id, b.id);
      const key = `${low}:${high}`;
      if (!seen.has(key)) { seen.add(key); result.push(a.id < b.id ? [a, b] : [b, a]); }
    }
  }
  result.sort((left, right) => left[0].id - right[0].id || left[1].id - right[1].id);
  return result;
}
