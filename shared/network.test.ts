import { describe, test, expect } from 'vitest';
import { parseServerMessage } from './network.ts';
import { entityId, inputSeq, tickNumber, assertNever } from './types.ts';

describe('network runtime schema',()=>{
  for (const value of [
    {type:'joined',roomId:'training',players:['A'],playerId:1,seed:42,tickRate:30},
    {type:'players',players:['B']},
    {type:'chat',name:'B',text:'hi',time:10},
    {type:'pongTime',timestamp:200},
    {type:'gameEvent',eventType:'fired',id:2},
    {type:'snapshot',tick:7,entities:[],acks:[]},
  ]) test(`parses ${value.type}`,()=>expect(parseServerMessage(value).type).toBe(value.type));
  for (const bad of [null,12,{}, {type:'unknown'}, {type:'chat'},
    {type:'joined',playerId:'oops'}, {type:'gameEvent',eventType:'nope'},
    {type:'snapshot',tick:-1,entities:[],acks:[]},
    {type:'snapshot',tick:3,entities:[{kind:'ship'}],acks:[]},
  ]) test(`rejects invalid ${JSON.stringify(bad)}`,()=>expect(()=>parseServerMessage(bad)).toThrow());
  test('type validators accept valid values',()=>{
    expect(entityId(7)).toBe(7);
    expect(inputSeq(2)).toBe(2);
    expect(tickNumber(1)).toBe(1);
  });
  for (const n of [-1,1.2,Infinity,NaN,4294967296]) test(`rejects invalid branded number ${n}`,()=>{
    expect(()=>entityId(n)).toThrow(); expect(()=>inputSeq(n)).toThrow();expect(()=>tickNumber(n)).toThrow();
  });
  test('assertNever throws at runtime',()=>expect(()=>assertNever('unexpected' as never)).toThrow());
});
