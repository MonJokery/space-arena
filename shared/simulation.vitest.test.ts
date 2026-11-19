import { describe, test, expect } from 'vitest';
import { createArena, addShip, advanceArena, integrate, wrap, distanceSquared, rng, snapshot, DT, getBulletPoolSize } from './simulation.ts';
import { collisionPairs } from './spatial-hash.ts';
import { entityId } from './types.ts';

describe('physics / determinism', () => {
  for (let seed=0;seed<16;seed++) test(`seeded lockstep ${seed}`, () => {
    const a=createArena({width:960,height:600,asteroids:7},seed);
    const b=createArena({width:960,height:600,asteroids:7},seed);
    addShip(a,entityId(1));addShip(b,entityId(1));
    for(let i=0;i<75;i++) {
      const c = new Map([[entityId(1), {thrust:i%3===0,right:i%5===0,fire:i%7===0}]]);
      advanceArena(a,c);advanceArena(b,c);
    }
    expect(snapshot(a)).toEqual(snapshot(b));
  });
  for (const [name,input] of Object.entries({idle:{},left:{left:true},right:{right:true},thrust:{thrust:true},brake:{brake:true},opposite:{left:true,right:true},complex:{thrust:true,fire:true,right:true}}))
    test(`integrate finite ${name}`,()=>{
      const ship={x:100,y:100,vx:0,vy:0,angle:0};
      const after=integrate(ship,input,DT);
      expect(Number.isFinite(after.x)).toBe(true);
      expect(ship.x).toBe(100);
    });
  test('seed produces same numbers', () => {
    const a=rng(42),b=rng(42);
    for (let i=0;i<100;i++) expect(a()).toBe(b());
  });
  test('wrap and collision across arena edge',()=>{
    expect(distanceSquared({x:959,y:200},{x:2,y:200},960,600)).toBe(9);
    expect(wrap({x:-1,y:601},960,600)).toEqual({x:959,y:1});
  });
  test('spatial hash includes boundary collision',()=>{
    const arena=createArena({width:960,height:600,asteroids:0});
    const a=addShip(arena,entityId(1));const b=addShip(arena,entityId(2));
    a.x=959;a.y=150;b.x=1;b.y=150;
    expect(collisionPairs(arena).some(([l,r])=>l.id===1&&r.id===2)).toBe(true);
  });
  test('recycle bullets after TTL',()=>{
    const arena=createArena({width:960,height:600,asteroids:0});
    const ship=addShip(arena,entityId(1));ship.invulnerable=0;
    advanceArena(arena,new Map([[entityId(1),{fire:true}]]));
    for(let i=0;i<70;i++) advanceArena(arena);
    expect(getBulletPoolSize(arena)).toBeGreaterThan(0);
  });
});
