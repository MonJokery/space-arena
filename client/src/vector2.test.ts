import { describe, test, expect } from 'vitest';
import { Vector2 } from './vector2.ts';
describe('Vector2 immutable operations', () => {
  const a = new Vector2(3, 4);
  test('coordinates and length', () => { expect(a.x).toBe(3); expect(a.y).toBe(4); expect(a.length()).toBe(5); });
  test('addition', () => { expect(a.add(new Vector2(1,2))).toEqual(new Vector2(4,6)); expect(a).toEqual(new Vector2(3,4)); });
  test('subtraction', () => { expect(a.subtract(new Vector2(1,1))).toEqual(new Vector2(2,3)); expect(a).toEqual(new Vector2(3,4)); });
  test('scaling', () => expect(a.scale(2)).toEqual(new Vector2(6,8)));
  test('distance', () => expect(a.distance(new Vector2(0,0))).toBe(5));
  test('normalize', () => expect(a.normalize().length()).toBeCloseTo(1));
  test('zero vector', () => expect(new Vector2().normalize()).toEqual(new Vector2()));
  test('unit angle', () => { const v=Vector2.fromAngle(0); expect(v.x).toBeCloseTo(1); expect(v.y).toBeCloseTo(0); });
});
