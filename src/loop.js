// Аккумулятор fixed timestep: update викликається з dt=1/60, render - кожен rAF.
export function createLoop({ update, render, onStats, mode = 'normal' }) {
  const STEP = 1000 / 60;
  let running = false;
  let id = 0;
  let previousTime = 0;
  let accumulator = 0;
  let frames = 0;
  let steps = 0;
  let elapsedStats = 0;
  let longestFrame = 0;

  function tick(now) {
    if (!running) return;
    const rawMs = Math.max(0, now - previousTime);
    previousTime = now;
    const frameMs = Math.min(rawMs, 250);
    longestFrame = Math.max(longestFrame, rawMs);
    if (mode === 'block') {
      const until = performance.now() + 35;
      while (performance.now() < until) { /* Навмисно блокуємо main thread */ }
    }

    if (mode === 'variable') {
      // Навмисна помилка: dt залежить від частоти кадрів (обмежено 250 мс).
      update(frameMs / 1000);
      steps += 1;
      render(1);
    } else {
      accumulator += frameMs;
      let count = 0;
      while (accumulator >= STEP && count < 15) {
        update(STEP / 1000);
        accumulator -= STEP;
        steps += 1;
        count += 1;
      }
      if (count === 15) accumulator = 0;
      render(accumulator / STEP);
    }
    frames += 1;
    elapsedStats += rawMs;
    if (elapsedStats >= 1000) {
      const seconds = elapsedStats / 1000;
      onStats({ fps: frames / seconds, sps: steps / seconds, frameMs: elapsedStats / frames, maxFrameMs: longestFrame });
      frames = 0; steps = 0; elapsedStats = 0; longestFrame = 0;
    }
    if (mode !== 'interval') id = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (running) return;
      running = true;
      previousTime = performance.now();
      if (mode === 'interval') id = setInterval(() => tick(performance.now()), 1000 / 60);
      else id = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (mode === 'interval') clearInterval(id);
      else cancelAnimationFrame(id);
    },
  };
}
