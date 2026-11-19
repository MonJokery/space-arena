let worker: Worker | null = null;
async function runWorker(input: number[]): Promise<number> {
  const current = worker;
  if (!current) throw new Error('Worker is not active');
  return await new Promise<number>((resolve, reject) => {
    const cleanup = () => { current.removeEventListener('message', receive); current.removeEventListener('error', fail); };
    const receive = (event: MessageEvent<{p99:number}>) => { cleanup(); resolve(event.data.p99); };
    const fail = () => { cleanup(); reject(new Error('Worker failed')); };
    current.addEventListener('message', receive);
    current.addEventListener('error', fail, { once: true });
    current.postMessage(input);
  });
}
export async function compareWorker() {
  const values = Array.from({ length: 50000 }, (_, i) => Math.sin(i) * i);
  const start = performance.now();
  [...values].sort((a, b) => a - b);
  const mainMs = performance.now() - start;
  worker?.terminate();
  worker = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' });
  const workerStart = performance.now();
  await runWorker([...values]);
  const workerMs = performance.now() - workerStart;
  const keepWorker = workerMs < mainMs;
  if (!keepWorker) { worker.terminate(); worker = null; }
  return { mainMs, workerMs, keepWorker };
}
export async function computeFrameP99(values: number[]): Promise<number> {
  if (worker) return await runWorker([...values]);
  if (!values.length) return 0;
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.floor((sorted.length-1)*.99)] ?? 0;
}
