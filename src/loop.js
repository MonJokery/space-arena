// Фізика працює з фіксованим кроком 1/60 с.
export function createLoop({ update, render, onStats = () => {} }) {
  const stepMs = 1000 / 60;
  let running = false;
  let frameId = 0;
  let lastTime = 0;
  let accumulator = 0;
  let elapsed = 0;
  let frames = 0;
  let steps = 0;
  let maxFrameMs = 0;

  function frame(time) {
    if (!running) return;
    const rawMs = Math.max(0, time - lastTime);
    lastTime = time;
    accumulator += Math.min(rawMs, 250);
    maxFrameMs = Math.max(maxFrameMs, rawMs);
    let count = 0;
    while (accumulator >= stepMs && count < 15) {
      update(stepMs / 1000);
      accumulator -= stepMs;
      steps++;
      count++;
    }
    if (count === 15) accumulator = 0;
    render(accumulator / stepMs);
    frames++;
    elapsed += rawMs;
    if (elapsed >= 1000) {
      const seconds = elapsed / 1000;
      onStats({ fps: frames / seconds, sps: steps / seconds,
        frameMs: elapsed / frames, maxFrameMs });
      elapsed = 0;
      frames = 0;
      steps = 0;
      maxFrameMs = 0;
    }
    frameId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = performance.now();
      frameId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(frameId);
    },
  };
}
