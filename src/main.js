import './style.css';
import { createInput } from './input.js';
import { createLoop } from './loop.js';
import { makeShip, integrate, wrapShip, interpolateShip } from './physics.js';
import { createRenderer } from './render.js';

const $ = (selector) => document.querySelector(selector);
const renderer = createRenderer($('#game'));
const input = createInput();
let { width, height } = renderer.getSize();
let current = makeShip(width, height);
let previous = { ...current };
let latestStats = { fps: 0, sps: 0, frameMs: 0, maxFrameMs: 0 };
let loop;
let measuring = false;
let samples = [];

const descriptions = {
  normal: 'Еталон: rAF синхронізує малювання з браузером; акумулятор дає фіксований dt = 1/60 с.',
  block: '35 мс busy-wait у кожному кадрі затримує main thread: падає FPS, затримуються події.',
  interval: 'setInterval(1000/60) не синхронізується з оновленням дисплея: кадри можуть бути нерівномірні.',
  variable: 'Фізика оновлюється один раз за кадр зі змінним dt: steps/s ≈ FPS і результат чутливіший до коливань часу кадру.',
};
function reset() { ({ width, height } = renderer.getSize()); current = makeShip(width, height); previous = { ...current }; }
function update(dt) { previous = { ...current }; current = wrapShip(integrate(current, input.read(), dt), width, height); }
function draw(alpha) { renderer.draw(interpolateShip(previous, current, alpha, width, height), input.read().thrust); $('#speed').textContent = Math.round(Math.hypot(current.vx, current.vy)); }
function onStats(stats) {
  latestStats = stats;
  $('#fps').textContent = Math.round(stats.fps);
  $('#steps').textContent = Math.round(stats.sps);
  $('#frame-ms').textContent = stats.frameMs.toFixed(1);
  if (measuring) samples.push(stats);
}
function setMode(mode) {
  if (loop) loop.stop();
  loop = createLoop({ update, render: draw, onStats, mode });
  $('#mode-label').textContent = `${mode.toUpperCase()} · ${mode === 'normal' ? 'rAF + FIXED STEP' : 'EXPERIMENT'}`;
  $('#experiment-help').textContent = descriptions[mode];
  reset(); loop.start();
}
$('#experiment').addEventListener('change', (event) => {
  if (measuring) { event.target.value = $('#experiment').dataset.active || 'normal'; return; }
  $('#experiment').dataset.active = event.target.value;
  setMode(event.target.value);
});
$('#reset').addEventListener('click', reset);
$('#measure').addEventListener('click', async () => {
  if (measuring) return;
  measuring = true; samples = [];
  $('#measure').disabled = true;
  const mode = $('#experiment').value;
  $('#measure-status').textContent = 'Триває вимірювання протягом 10 секунд…';
  await new Promise((resolve) => setTimeout(resolve, 10000));
  measuring = false; $('#measure').disabled = false;
  if (!samples.length) { $('#measure-status').textContent = 'Недостатньо даних. Повтори вимірювання в активній вкладці.'; return; }
  const mean = (key) => samples.reduce((sum, s) => sum + s[key], 0) / samples.length;
  const result = { mode, durationSeconds: 10, samples: samples.length, stepsPerSecond: +mean('sps').toFixed(1), framesPerSecond: +mean('fps').toFixed(1), meanFrameMs: +mean('frameMs').toFixed(1), worstFrameMs: +Math.max(...samples.map((s) => s.maxFrameMs)).toFixed(1) };
  $('#measure-output').textContent = JSON.stringify(result, null, 2);
  $('#measure-status').textContent = 'Резлультат вимірювання.';
});
window.addEventListener('resize', () => { renderer.resize(); ({ width, height } = renderer.getSize()); current = wrapShip(current, width, height); previous = { ...current }; });
document.addEventListener('visibilitychange', () => { if (document.hidden && measuring) $('#measure-status').textContent = 'Вкладку було приховано — результат може бути неточним.'; });
$('#experiment').dataset.active = 'normal';
setMode('normal');
