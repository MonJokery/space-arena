import { performance } from 'node:perf_hooks';
import { createArena, addShip, advanceArena, snapshot } from '../shared/simulation.ts';
import { entityId } from '../shared/types.ts';
const seconds=Number(process.env.PROFILE_SECONDS ?? 30);
const arena=createArena({width:960,height:600,asteroids:5},7);
for(let i=0;i<8;i++) addShip(arena,entityId(i+1));
const times:number[]=[];
let t=0;
const start=performance.now();
while(performance.now()-start<seconds*1000) {
  const inputs=new Map([...Array(8).keys()].map(i=>[entityId(i+1),{thrust:true,right:t%80<20,fire:t%7===0}]));
  const one=performance.now();
  advanceArena(arena,inputs); snapshot(arena);
  times.push(performance.now()-one); t++;
}
times.sort((a,b)=>a-b);
const p=(q:number)=>times[Math.floor((times.length-1)*q)] ?? 0;
console.log(JSON.stringify({seconds,ticks:t,p50:p(.5),p95:p(.95),p99:p(.99),rssMiB:process.memoryUsage().rss/1048576},null,2));
console.log('GC pause lines appear separately from Node --trace-gc; this is a synthetic step benchmark, not a Chrome frame profile.');
