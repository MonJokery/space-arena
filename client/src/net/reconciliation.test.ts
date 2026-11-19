import { describe, test, expect } from 'vitest';
import { reconcile } from './reconciliation.ts';
import { entityId, inputSeq } from '../../../shared/types.ts';
import type { SnapshotEntity, InputPacket } from '../../../shared/types.ts';
const ship: SnapshotEntity={id:entityId(1),kind:'ship',x:20,y:40,vx:0,vy:0,angle:0,radius:18,hp:100,score:0,deaths:0,homing:false,invulnerable:0,owner:entityId(0)};
describe('prediction reconciliation',()=>{
  for (let ack=0;ack<=15;ack++) test(`ack ${ack} replays later inputs only`,()=>{
    const pending: InputPacket[]=Array.from({length:15},(_,i)=>({type:'input',seq:inputSeq(i+1),thrust:true}));
    const result=reconcile(ship,pending,ack,960,600);
    expect(result.pending.length).toBe(15-ack);
    expect(result.pending.every(e=>e.seq>ack)).toBe(true);
    expect(Number.isFinite(result.state.x)).toBe(true);
  });
});
