import { afterEach, test, expect, vi } from 'vitest';
import { createLoop } from './loop.ts';
afterEach(()=>{vi.unstubAllGlobals(); vi.useRealTimers();});
test('fixed 60Hz with fake animation clock, stop cancels scheduled frame',()=>{
  vi.useFakeTimers();
  let callback: ((time:number)=>void)|undefined;
  const cancel=vi.fn(); const update=vi.fn();const render=vi.fn();
  vi.stubGlobal('requestAnimationFrame',vi.fn((cb:(time:number)=>void)=>{callback=cb; return 7;}));
  vi.stubGlobal('cancelAnimationFrame',cancel);
  const loop=createLoop({update,render}); loop.start();
  const base=performance.now();
  callback?.(base+1000/60); callback?.(base+2*1000/60); callback?.(base+3*1000/60);
  expect(render).toHaveBeenCalledTimes(3);
  expect(update.mock.calls.length).toBeGreaterThanOrEqual(2);
  loop.stop();expect(cancel).toHaveBeenCalledWith(7);
});
