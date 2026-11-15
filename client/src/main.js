import './style.css';
import { loadAll } from './async/assets.js';
import { createSoundSystem } from './audio.js';
import { Lobby } from './lobby/lobby.js';
import { connectLobbyView } from './lobby/view.js';
import { createInput } from './input.js';
import { createLoop } from './loop.js';
import { createRenderer } from './render.js';
import { integrate, wrap, DT } from '../../shared/simulation.js';
import { interpolateShip } from './physics.js';
import { emitGameEvent } from './events.js';
import { createChat } from './net/chat.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#game');
let renderer, input, loop, lobby, sound, assets, roomConfig;
const chat = createChat(document);
function showScreen(name) {
  for (const id of ['loading-screen', 'lobby-screen', 'game-screen']) {
    $(`#${id}`).hidden = id !== `${name}-screen`;
  }
}
function showLoadingMessage(value) { $('#loading-status').textContent = value; }
const loadingCanvas = $('#loading-canvas');
const loadingCtx = loadingCanvas.getContext('2d');
function paintLoading(progress) {
  loadingCtx.fillStyle = '#0b1428';
  loadingCtx.fillRect(0, 0, 560, 110);
  loadingCtx.fillStyle = '#a9c9e5';
  loadingCtx.font = '15px sans-serif';
  loadingCtx.fillText(`Завантажено ${Math.round(progress * 100)}%`, 20, 30);
  loadingCtx.fillStyle = '#243956';
  loadingCtx.fillRect(20, 53, 520, 30);
  loadingCtx.fillStyle = '#69d6f5';
  loadingCtx.fillRect(20, 53, 520 * progress, 30);
}
paintLoading(0);
let loadingController;
async function boot() {
  loadingController?.abort();
  loadingController = new AbortController();
  const signal = loadingController.signal;
  showScreen('loading');
  $('#retry-load').hidden = true;
  $('#start-load').hidden = true;
  $('#loading-bar').value = 0; paintLoading(0);
  showLoadingMessage('Завантаження маніфесту…');
  try {
    const options = { signal,
      onProgress: ({ complete, total, file }) => {
        $('#loading-bar').value = total ? complete / total : 0;
        paintLoading(total ? complete / total : 0);
        $('#loading-count').textContent = `${complete}/${total}`;
        showLoadingMessage(`Завантажено ${file}`);
      },
    };
    assets = await loadAll(options);
    if (signal.aborted) return;
    $('#loading-bar').value = 1; paintLoading(1);
    showLobby();
  } catch (error) {
    if (signal.aborted) return;
    loadingController.abort();
    showLoadingMessage(`Завантаження не вдалося: ${error.message}. Натисни Retry, щоб повторити.`);
    $('#retry-load').hidden = false;
  }
}
$('#retry-load').addEventListener('click', () => { void boot(); });
$('#start-load').addEventListener('click', () => { void boot(); });
function showLobby() {
  showScreen('lobby');
  lobby?.hide();
  lobby = new Lobby();
  connectLobbyView(lobby, $('#lobby-screen'));
  lobby.addEventListener('join', (event) => { void startGame(event.detail); });
  lobby.show();
}
let playerId = null;
let seq = 0;
let pending = [];
let predicted = null;
let correction = { x: 0, y: 0 };
let correctionMagnitude = 0;
let accumulator = 0;
let lastSnapshotTime = 0;
let lastTick = 0;
let frames = [];
let fakeBullets = [];
const view = { entities: new Map(), [Symbol.iterator]() { return this.entities.values(); } };
const socket = chat.socket;

function getImpairment() {
  socket.impairment = {
    delay: Math.min(300, Math.max(0, Number($('#latency').value) || 0)),
    jitter: Math.min(150, Math.max(0, Number($('#jitter').value) || 0)),
    loss: Math.min(40, Math.max(0, Number($('#loss').value) || 0)),
  };
}
function blendState(a, b, t, width, height) {
  if (!a) return b;
  if (!b) return a;
  const pos = interpolateShip(a, b, t, width, height);
  return { ...b, ...pos };
}
function receiveSnapshot(state) {
  if (state.tick <= lastTick) return;
  lastTick = state.tick;
  lastSnapshotTime = performance.now();
  frames.push(state);
  if (frames.length > 16) frames.shift();
  const authoritative = state.entities.find((e) => e.id === playerId && e.kind === 'ship');
  if (!authoritative) return;
  const ack = new Map(state.acks).get(playerId) ?? 0;
  pending = pending.filter((e) => e.seq > ack);
  let reconciled = { ...authoritative };
  if ($('#predict').value !== 'off') {
    for (const item of pending) reconciled = wrap(integrate(reconciled, item, DT), roomConfig.width, roomConfig.height);
  }
  if (predicted) {
    const dx = shortest(reconciled.x - predicted.x, roomConfig.width);
    const dy = shortest(reconciled.y - predicted.y, roomConfig.height);
    correctionMagnitude = Math.hypot(dx, dy);
    correction = { x: correction.x - dx, y: correction.y - dy };
  } else correction = { x: 0, y: 0 };
  predicted = reconciled;
  $('#hp').textContent = authoritative.hp;
  $('#score').textContent = authoritative.score;
  $('#deaths').textContent = authoritative.deaths;
  $('#speed').textContent = Math.round(Math.hypot(authoritative.vx, authoritative.vy));
  $('#respawn').textContent = authoritative.hp <= 0 ? 'КОРАБЕЛЬ ЗНИЩЕНО · РЕСПАУН ЧЕРЕЗ 2 С' : '';
  $('#entities').textContent = state.entities.length;
}
function integrateBroken(ship, command, dt) {
  const result = integrate(ship, command, dt);
  result.x += Math.random() * 3;
  return result;
}
function shortest(n, size) {
  return ((n + size / 2) % size + size) % size - size / 2;
}
socket.addEventListener('message', (event) => {
  const message = event.detail;
  if (message.type === 'joined') {
    playerId = message.playerId;
    seq = 0; pending = []; predicted = null; lastTick = 0; frames = []; fakeBullets = [];
  }
  if (message.type === 'snapshot') receiveSnapshot(message);
  if (message.type === 'gameEvent' && !(message.eventType === 'fired' && message.id === playerId && $('#predict').value !== 'off')) emitGameEvent(message.eventType);
});
async function startGame({ name, room }) {
  roomConfig = room;
  getImpairment(); socket.jsonMode = $('#protocol').value === 'json';
  chat.join(name, room.id);
  try {
    await sound?.dispose();
    sound = createSoundSystem(assets.audio);
    await sound.unlock();
  } catch (error) { $('#audio-status').textContent = `Звук недоступний: ${error.message}`; }
  $('#player-label').textContent = `${name} · ${room.name}`;
  showScreen('game');
  resizeArena(); renderer = createRenderer(canvas, assets.images);
  input?.destroy(); input = createInput();
  window.removeEventListener('resize', onResize);
  window.addEventListener('resize', onResize);
  reset();
  loop?.stop();
  loop = createLoop({ update, render, onStats });
  loop.start();
}
function reset() {
  predicted = null; pending = []; correction = { x: 0, y: 0 }; frames = []; lastTick = 0;
}
function update(dt) {
  getImpairment();
  accumulator += dt;
  while (accumulator >= DT) {
    accumulator -= DT;
    if (playerId !== null) {
      const keys = input.read();
      const command = {
        type: 'input', seq: ++seq,
        thrust: !!keys.thrust, left: !!keys.left, right: !!keys.right,
        brake: !!keys.brake, fire: input.isPressed('KeyF') || input.isPressed('KeyH'),
        homing: input.isPressed('KeyH'),
      };
      if (socket.sendInput(command)) {
        if ($('#predict').value !== 'off') {
          pending.push(command);
          if (pending.length > 90) pending.shift();
          if (predicted?.hp > 0) {
            predicted = wrap(
              $('#predict').value === 'broken' ? integrateBroken(predicted, command, DT) : integrate(predicted, command, DT),
              roomConfig.width, roomConfig.height,
            );
          }
          if (command.fire && predicted && (fakeBullets.length === 0 || performance.now() - fakeBullets[fakeBullets.length - 1].created > 225)) {
            fakeBullets.push({ id: -(seq + 1), kind: 'bullet', x: predicted.x + Math.cos(predicted.angle) * 23, y: predicted.y + Math.sin(predicted.angle) * 23, vx: predicted.vx + Math.cos(predicted.angle) * 510, vy: predicted.vy + Math.sin(predicted.angle) * 510, radius: 5, angle: predicted.angle, created: performance.now(), homing: command.homing });
            emitGameEvent('fired');
          }
        }
      }
    }
  }
  correction.x *= Math.exp(-dt / 0.1);
  correction.y *= Math.exp(-dt / 0.1);
  fakeBullets = fakeBullets.filter((b) => performance.now() - b.created < 220);
  for (const bullet of fakeBullets) {
    bullet.x = ((bullet.x + bullet.vx * dt) % roomConfig.width + roomConfig.width) % roomConfig.width;
    bullet.y = ((bullet.y + bullet.vy * dt) % roomConfig.height + roomConfig.height) % roomConfig.height;
  }
}
function render() {
  if (!renderer || !frames.length) return;
  const latest = frames[frames.length - 1];
  const targetTick = latest.tick - 3;
  let a = frames[0], b = latest;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].tick >= targetTick) { a = frames[i - 1]; b = frames[i]; break; }
  }
  const t = a.tick === b.tick ? 1 : Math.max(0, Math.min(1, (targetTick - a.tick) / (b.tick - a.tick)));
  const previous = new Map(a.entities.map((e) => [e.id, e]));
  view.entities.clear();
  const viewport = renderer.getSize();
  const scaleX = viewport.width / roomConfig.width;
  const scaleY = viewport.height / roomConfig.height;
  for (const entity of b.entities) {
    let state = blendState(previous.get(entity.id), entity, t, roomConfig.width, roomConfig.height);
    if (entity.kind === 'ship' && entity.id === playerId && predicted && $('#predict').value !== 'off') {
      state = { ...predicted, x: ((predicted.x + correction.x) % roomConfig.width + roomConfig.width) % roomConfig.width, y: ((predicted.y + correction.y) % roomConfig.height + roomConfig.height) % roomConfig.height };
    }
    const sx = state.x * scaleX, sy = state.y * scaleY;
    view.entities.set(entity.id, {
      ...state, x: sx, y: sy, radius: state.radius * Math.min(scaleX, scaleY),
      position: { x: sx, y: sy }, previousPosition: { x: sx, y: sy },
      velocity: { x: state.vx * scaleX, y: state.vy * scaleY },
      thrusting: entity.kind === 'ship' && entity.id === playerId && input.read().thrust,
    });
  }
  for (const bullet of fakeBullets) {
    const x = bullet.x * scaleX, y = bullet.y * scaleY;
    view.entities.set(bullet.id, { ...bullet, x, y, radius: bullet.radius * Math.min(scaleX, scaleY), position: { x, y }, previousPosition: { x, y }, velocity: { x: bullet.vx * scaleX, y: bullet.vy * scaleY } });
  }
  renderer.draw(view, 1);
}
function onStats(stats) {
  $('#fps').textContent = Math.round(stats.fps);
  $('#steps').textContent = 30;
  $('#frame-ms').textContent = stats.frameMs.toFixed(1);
  socket.measure();
  $('#net-rtt').textContent = Math.round(socket.rtt);
  $('#net-age').textContent = lastSnapshotTime ? Math.round(performance.now() - lastSnapshotTime) : 0;
  $('#net-bps').textContent = socket.bytesPerSecond;
  $('#net-queue').textContent = pending.length;
  $('#net-error').textContent = correctionMagnitude.toFixed(2);
}
function resizeArena() {
  if (!roomConfig) return;
  canvas.style.height = `${Math.max(300, Math.min(620, Math.round(canvas.clientWidth * roomConfig.height / roomConfig.width)))}px`;
}
function onResize() { resizeArena(); renderer?.resize(); }
$('#reset').addEventListener('click', reset);
$('#leave-room').addEventListener('click', () => {
  loop?.stop(); input?.destroy(); window.removeEventListener('resize', onResize);
  chat.leave(); playerId = null; lobby?.hide(); showLobby();
});
