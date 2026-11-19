import { describe, test, expect } from 'vitest';
import { rateLimit } from './rate-limit.ts';
describe('rate limit',()=>{
  for (let count=0;count<=90;count+=5) test(`count ${count}`,()=>{
    const result=rateLimit(100, count, 500, 85);
    expect(result.allowed).toBe(count+1<=85);
    expect(result.count).toBe(count+1);
  });
  test('window resets after a second',()=>{
    expect(rateLimit(100,90,1100,85)).toMatchObject({count:1,allowed:true,windowStart:1100});
  });
});
