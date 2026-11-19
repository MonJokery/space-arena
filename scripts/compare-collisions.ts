import { performance } from 'node:perf_hooks';
import { createArena, addShip } from '../shared/simulation.ts';
import { collisionPairs } from '../shared/spatial-hash.ts';
import { entityId } from '../shared/types.ts';
console.log('Pairs examined: naive vs spatial hash (not wall-time of full server tick)');
for(const n of [8,32,64,128]) {
  const arena=createArena({width:1100,height:700,asteroids:0},123);
  for(let i=0;i<n;i++) {
    const e=addShip(arena,entityId(i+1));
    e.x = (53*i)%1100; e.y=(97*i)%700;
  }
  let naiveCount=0;
  const entities=[...arena.entities.values()];
  const startA=performance.now();
  for(let i=0;i<entities.length;i++)for(let j=i+1;j<entities.length;j++)naiveCount++;
  const naiveMs=performance.now()-startA;
  const startB=performance.now();
  const pairs=collisionPairs(arena);
  const hashMs=performance.now()-startB;
  console.log({clients:n,naivePairs:naiveCount,hashPairs:pairs.length,naiveMs,hashMs});
}
