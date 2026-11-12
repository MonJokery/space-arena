import './style.css';
import { loadAll } from './async/assets.js';
import { createSoundSystem } from './audio.js';
import { Lobby } from './lobby/lobby.js';
import { connectLobbyView } from './lobby/view.js';
import { createInput } from './input.js';
import { createLoop } from './loop.js';
import { createRenderer } from './render.js';
import { World } from './world.js';
import { Vector2 } from './vector2.js';
import { Asteroid } from './entities/asteroid.js';
import { Pickup } from './entities/pickup.js';
import { createChat } from './net/chat.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#game');
let renderer, input, world, loop, lobby, sound, assets, roomConfig;
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
  $('#cancel-load').hidden = false;
  $('#loading-bar').value = 0; paintLoading(0);
  showLoadingMessage('Завантаження маніфесту…');
  try {
    const failure = $('#failure-mode').value;
    const options = { signal, delayMs: failure === 'slow' ? 2500 : 0,
      transformEntry: (entry) => {
        if (failure === '404' && entry.id === 'ship') return { ...entry, url: '/assets/absent-ship.png' };
        if (failure === 'json' && entry.id === 'rooms') return { ...entry, url: '/assets/broken.json' };
        if (failure === 'timeout' && entry.id === 'rooms') return { ...entry, url: '/api/rooms', type: 'json' };
        return entry;
      },
      onProgress: ({ complete, total, file }) => {
        $('#loading-bar').value = total ? complete / total : 0;
        paintLoading(total ? complete / total : 0);
        $('#loading-count').textContent = `${complete}/${total}`;
        showLoadingMessage(`Завантажено ${file}`);
      },
    };
    if (failure === 'timeout') {
      const timeout = AbortSignal.timeout(1);
      options.signal = AbortSignal.any([signal, timeout]);
    }
    assets = await loadAll(options);
    if (signal.aborted) return;
    $('#loading-bar').value = 1; paintLoading(1);
    $('#cancel-load').hidden = true;
    showLobby();
  } catch (error) {
    if (signal.aborted) return; // Повідомлення про ручний Abort уже відображено.
    loadingController.abort(); // Скасувати інші запити з Promise.all.
    showLoadingMessage(`Завантаження не вдалося: ${error.message}. Вибери «Без помилки» та натисни Retry.`);
    $('#retry-load').hidden = false;
    $('#cancel-load').hidden = true;
  }
}
$('#retry-load').addEventListener('click', () => { void boot(); });
$('#start-load').addEventListener('click', () => { void boot(); });
$('#cancel-load').addEventListener('click', () => {
  loadingController?.abort();
  showLoadingMessage('Скасовано користувачем. Можна повторити.');
  $('#retry-load').hidden = false;
  $('#cancel-load').hidden = true;
});
function showLobby() {
  showScreen('lobby');
  lobby?.hide();
  lobby = new Lobby();
  connectLobbyView(lobby, $('#lobby-screen'));
  lobby.addEventListener('join', (event) => { void startGame(event.detail); });
  lobby.show();
}
async function startGame({ name, room }) {
  roomConfig = room;
  chat.join(name, room.id);
  try {
    sound = createSoundSystem(assets.audio);
    await sound.unlock(); // Join — жест гравця
  } catch (error) { $('#audio-status').textContent = `Звук недоступний: ${error.message}`; }
  $('#player-label').textContent = `${name} · ${room.name}`;
  showScreen('game');
  resizeArena();
  renderer = createRenderer(canvas, assets.images);
  input = createInput();
  input.on('KeyF', () => { world?.player?.fire(world, false); });
  input.on('KeyH', () => { world?.player?.fire(world, true); });
  window.removeEventListener('resize', onResize);
  window.addEventListener('resize', onResize);
  reset();
  loop?.stop();
  loop = createLoop({ update, render: (alpha) => renderer.draw(world, alpha), onStats });
  loop.start();
}
function reset() {
  const { width, height } = renderer.getSize();
  world = new World(width, height);
  world.resetPlayer();
  for (let i = 0; i < roomConfig.asteroids; i++) {
    const angle = i * Math.PI * 2 / roomConfig.asteroids;
    const x = width * (0.5 + 0.32 * Math.cos(angle));
    const y = height * (0.5 + 0.32 * Math.sin(angle));
    world.spawn(new Asteroid({ position: new Vector2(x, y), velocity: new Vector2(-Math.sin(angle) * 18, Math.cos(angle) * 18), radius: 21 + (i % 3) * 4, homing: i === 0 }));
  }
  world.spawn(new Pickup({ position: new Vector2(width * 0.2, height * 0.7), heal: 30 }));
  world.spawn(new Pickup({ position: new Vector2(width * 0.8, height * 0.3), heal: 30 }));
  world.flush();
  updateHud();
}
function updateHud() {
  const ship = world.player;
  $('#hp').textContent = ship?.hp ?? 0;
  $('#score').textContent = world.score;
  $('#deaths').textContent = world.deaths;
  $('#speed').textContent = Math.round(ship?.velocity.length() || 0);
  $('#entities').textContent = world.entities.size;
  $('#respawn').textContent = ship ? '' : 'КОРАБЕЛЬ ЗНИЩЕНО · РЕСПАУН ЧЕРЕЗ 2 С';
}
function update(dt) {
  const ship = world.player;
  if (ship) {
    ship.input = input.read();
    if (input.isPressed('KeyF')) ship.fire(world, false);
    if (input.isPressed('KeyH')) ship.fire(world, true);
  }
  world.step(dt);
  updateHud();
}
function onStats(stats) {
  $('#fps').textContent = Math.round(stats.fps);
  $('#steps').textContent = Math.round(stats.sps);
  $('#frame-ms').textContent = stats.frameMs.toFixed(1);
}
function resizeArena() {
  if (!roomConfig) return;
  canvas.style.height = `${Math.max(300, Math.min(620, Math.round(canvas.clientWidth * roomConfig.height / roomConfig.width)))}px`;
}
function onResize() {
  resizeArena();
  renderer.resize();
  const { width, height } = renderer.getSize();
  world.width = width; world.height = height;
  for (const entity of world) { entity.position = world.wrap(entity.position); entity.previousPosition = entity.position; }
}
$('#reset').addEventListener('click', () => { if (world) reset(); });
$('#leave-room').addEventListener('click', () => { loop?.stop(); input?.destroy(); window.removeEventListener('resize', onResize); chat.leave(); lobby?.hide(); showLobby(); });
