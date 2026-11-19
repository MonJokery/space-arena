import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
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

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();
let sentMessages = 0, sentBytes = 0, receivedMessages = 0, receivedBytes = 0;
let lastMetricsAt = performance.now();
let lastLoopSample = performance.eventLoopUtilization();
export function countTraffic(direction: 'in' | 'out', bytes: number): void {
  if (direction === 'in') { receivedMessages++; receivedBytes += bytes; }
  else { sentMessages++; sentBytes += bytes; }
}
export function trafficMetrics() {
  const now = performance.now();
  const utilization = performance.eventLoopUtilization(lastLoopSample);
  lastLoopSample = performance.eventLoopUtilization();
  const seconds = Math.max((now - lastMetricsAt) / 1000, 0.001);
  const result = { messagesPerSecond: Math.round((sentMessages + receivedMessages) / seconds),
    bytesPerSecond: Math.round((sentBytes + receivedBytes) / seconds),
    sentMessages, receivedMessages, eventLoopDelayP99Ms: Number((loopDelay.percentile(99) / 1e6).toFixed(2)), eventLoopUtilization: Number(utilization.utilization.toFixed(4)),
    rss: process.memoryUsage().rss, heapUsed: process.memoryUsage().heapUsed };
  sentMessages = 0; receivedMessages = 0; sentBytes = 0; receivedBytes = 0; lastMetricsAt = now;
  return result;
}
