import { describe, test, expect } from 'vitest';
import { collisionPairs } from './spatial-hash.ts';
import { createArena, addShip } from './simulation.ts';
import { entityId } from './types.ts';
describe('spatial hash',()=>{
  test('does not duplicate pairs in multiple buckets',()=>{
    const arena=createArena({width:960,height:600,asteroids:0});
    const a=addShip(arena,entityId(1)),b=addShip(arena,entityId(2));
    a.x=40;a.y=40;a.radius=120;b.x=50;b.y=50;b.radius=120;
    expect(collisionPairs(arena).filter(([l,r])=>l.id===a.id&&r.id===b.id)).toHaveLength(1);
  });
  test('does not pair distant ships',()=>{
    const arena=createArena({width:960,height:600,asteroids:0});
    const a=addShip(arena,entityId(1)),b=addShip(arena,entityId(2));
    a.x=100;a.y=100;b.x=500;b.y=350;
    expect(collisionPairs(arena)).toEqual([]);
  });
  test('small arenas still work',()=>{
    const arena=createArena({width:50,height:50,asteroids:0});
    addShip(arena,entityId(1)); addShip(arena,entityId(2));
    expect(collisionPairs(arena).filter(([a,b]) => a.kind === 'ship' && b.kind === 'ship').length).toBe(1);
  });
});
