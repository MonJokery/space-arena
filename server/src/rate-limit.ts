export function rateLimit(windowStart: number, count: number, now: number, max = 85): { windowStart: number; count: number; allowed: boolean } {
  if (now - windowStart >= 1000) { windowStart = now; count = 0; }
  count++;
  return { windowStart, count, allowed: count <= max };
}
