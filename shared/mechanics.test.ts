import { test, expect } from 'vitest';
import { createArena, addShip, advanceArena, snapshot, getBulletPoolSize } from './simulation.ts';
import { encodeSnapshot, decodeSnapshot, encodeInput, decodeInput } from './protocol.ts';
import { entityId, inputSeq } from './types.ts';
import type { Arena, BulletEntity, AsteroidEntity, PickupEntity } from './types.ts';

const fixture = () => { const arena=createArena({width:960,height:600,asteroids:0},123); const ship=addShip(arena,entityId(1)); ship.invulnerable=0; return {arena,ship}; };
test('ship heals from pickup and pickup disappears',()=>{
  const {arena,ship}=fixture(); ship.hp=50;
  const pickup:PickupEntity={id:entityId(33),kind:'pickup',x:ship.x,y:ship.y,vx:0,vy:0,angle:0,radius:13,hp:1};
  arena.entities.set(pickup.id,pickup);
  advanceArena(arena);
  expect(ship.hp).toBe(80); expect(arena.entities.has(pickup.id)).toBe(false); expect(ship.score).toBe(5);
});
test('asteroid collision inflicts limited damage with invulnerability',()=>{
  const {arena,ship}=fixture();
  const asteroid:AsteroidEntity={id:entityId(44),kind:'asteroid',x:ship.x,y:ship.y,vx:0,vy:0,angle:0,radius:25,hp:3,homing:false};
  arena.entities.set(asteroid.id,asteroid);
  advanceArena(arena); const hp=ship.hp;
  expect(hp).toBeLessThan(100);expect(hp).toBeGreaterThan(0);
  advanceArena(arena);expect(ship.hp).toBe(hp);
});
test('bullet hits asteroid, scores and recycles',()=>{
  const {arena,ship}=fixture();ship.invulnerable=5;
  const asteroid:AsteroidEntity={id:entityId(44),kind:'asteroid',x:500,y:320,vx:0,vy:0,angle:0,radius:18,hp:1,homing:false};
  arena.entities.set(asteroid.id,asteroid);
  const bullet:BulletEntity={id:entityId(45),kind:'bullet',owner:ship.id,x:500,y:320,vx:0,vy:0,angle:0,radius:5,ttl:1,hp:1,homing:false};
  arena.entities.set(bullet.id,bullet);
  const events=advanceArena(arena);
  expect(events.some(e=>e.type==='hit')).toBe(true);
  expect(arena.entities.has(asteroid.id)).toBe(false);
  expect(ship.score).toBe(10);
  expect(getBulletPoolSize(arena)).toBeGreaterThan(0);
});
test('bullet hits opponent, starts respawn',()=>{
  const {arena,ship}=fixture();const enemy=addShip(arena,entityId(2));enemy.invulnerable=0;enemy.hp=20;
  const bullet:BulletEntity={id:entityId(45),kind:'bullet',owner:ship.id,x:enemy.x,y:enemy.y,vx:0,vy:0,angle:0,radius:5,ttl:1,hp:1,homing:false};
  arena.entities.set(bullet.id,bullet);
  const events=advanceArena(arena);
  expect(events.some(e=>e.type==='exploded')).toBe(true);
  expect(enemy.hp).toBe(0); expect(enemy.respawn).toBe(2); expect(ship.score).toBeGreaterThan(0);
  for(let i=0;i<65;i++)advanceArena(arena);
  expect(enemy.hp).toBe(100);
});
test('normal fire, homing fire and cooldown',()=>{
  const {arena,ship}=fixture();
  const fired=advanceArena(arena,new Map([[ship.id,{fire:true,homing:true}]]));
  expect(fired.some(e=>e.type==='fired')).toBe(true);
  expect([...arena.entities.values()].some(e=>e.kind==='bullet'&&e.homing)).toBe(true);
  expect(advanceArena(arena,new Map([[ship.id,{fire:true}]])).some(e=>e.type==='fired')).toBe(false);
});
test('wrap/homing asteroid follows target',()=>{
  const arena=createArena({width:960,height:600,asteroids:1}); const ship=addShip(arena,entityId(1));
  const asteroid=[...arena.entities.values()].find(e=>e.kind==='asteroid')!;
  const initialVx=asteroid.vx;
  advanceArena(arena);
  expect(Number.isFinite(asteroid.x)).toBe(true);
  expect(asteroid.vx).not.toBe(initialVx);
  expect(ship.kind).toBe('ship');
});
test('binary snapshot preserves all four kinds',()=>{
  const arena=createArena({width:960,height:600,asteroids:2},11); const ship=addShip(arena,entityId(1));
  advanceArena(arena,new Map([[ship.id,{fire:true}]]));
  const decoded=decodeSnapshot(encodeSnapshot(snapshot(arena)));
  for(const kind of ['ship','bullet','asteroid','pickup'])expect(decoded.entities.some(e=>e.kind===kind)).toBe(true);
});
test('invalid entity flags, NaN, and count fail to decode',()=>{
  const {arena}=fixture();const good=encodeSnapshot(snapshot(arena));
  for(const modify of [
    (v:DataView)=>v.setUint8(15,4),
    (v:DataView)=>v.setFloat32(18,NaN,true),
    (v:DataView)=>v.setUint16(6,500,true),
    (v:DataView)=>v.setInt16(36,-1,true),
  ]) {
    const bytes=good.slice(0);modify(new DataView(bytes));
    expect(()=>decodeSnapshot(bytes)).toThrow();
  }
});
test('invalid input sequence is rejected',()=>{
  const data=encodeInput({type:'input',seq:inputSeq(1)});
  const v=new DataView(data);v.setUint32(2,0,true);
  expect(()=>decodeInput(data)).toThrow();
});
