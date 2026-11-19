export const tickTimes: number[] = [];
export function recordTick(ms: number): void {
  tickTimes.push(ms);
  if (tickTimes.length > 600) tickTimes.shift();
}
export function tickMetrics() {
  if (!tickTimes.length) return { p50: 0, p95: 0, p99: 0, max: 0, samples: 0 };
  const sorted = [...tickTimes].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.floor((sorted.length - 1) * q)] ?? 0;
  return { p50: at(.5), p95: at(.95), p99: at(.99), max: sorted[sorted.length - 1] ?? 0, samples: sorted.length };
}
