import { describe, test, expect } from 'vitest';
import { parseClientMessage } from './protocol.ts';
describe('client Zod entrypoint',()=>{
  for (const [text,ok] of [
    ['{"type":"join","name":"Alpha","roomId":"training"}',true],
    ['{"type":"leave"}',true],
    ['{"type":"pingTime","timestamp":0}',true],
    ['{"type":"chat","text":"abc"}',true],
    ['{"type":"chat","text":""}',false],
    ['{"type":"chat","text":15}',false],
    ['{"type":"input","seq":0}',false],
    ['{"type":"join","name":"","roomId":"training"}',false],
    ['{"type":"join","name":"A","roomId":"../foo"}',false],
    ['{"type":"leave","extra":true}',false],
    ['garbage',false]
  ] as const) test(`message acceptance ${text}`,()=>{
    if(ok) expect(()=>parseClientMessage(text)).not.toThrow();
    else expect(()=>parseClientMessage(text)).toThrow();
  });
});
