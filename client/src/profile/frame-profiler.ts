export type FrameSummary = { durationSeconds: number; samples: number; p50: number; p95: number; p99: number; max: number; renderP95: number; longFrames: number };
export function percentile(values: readonly number[], q: number): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * q))] ?? 0;
}
export function makeFrameProfiler() {
  let frames: number[] = [];
  let renderSamples: number[] = [];
  let renderStart = 0;
  let start = performance.now();
  let collecting = false;
  return {
    start() { frames = []; renderSamples = []; start = performance.now(); collecting = true; },
    stop(): FrameSummary {
      collecting = false;
      return { durationSeconds: (performance.now() - start) / 1000, samples: frames.length,
        p50: percentile(frames, 0.5), p95: percentile(frames, 0.95), p99: percentile(frames, 0.99),
        max: Math.max(0, ...frames), renderP95: percentile(renderSamples, 0.95),
        longFrames: frames.filter((n) => n >= 16.7).length };
    },
    frame(duration: number) { if (collecting && duration > 0 && frames.length < 30000) frames.push(duration); },
    beginRender() { renderStart = performance.now(); },
    endRender() { if (collecting) renderSamples.push(performance.now() - renderStart); },
    samples() { return [...frames]; },
    get recording() { return collecting; },
  };
}
export const frameProfiler = makeFrameProfiler();
