import './style.css';
import { loadAll } from './async/assets.ts';
import type { Assets, LoadProgress } from './async/assets.ts';
import { createSoundSystem } from './audio.ts';
import { Lobby, RoomSchema } from './lobby/lobby.ts';
import type { RoomInfo } from './lobby/lobby.ts';
import { connectLobbyView } from './lobby/view.ts';
import { createInput } from './input.ts';
import { createLoop } from './loop.ts';
import type { LoopStats } from './loop.ts';
import { createRenderer } from './render.ts';
import type { RenderEntity } from './render.ts';
import { integrate, wrap, DT } from '../../shared/simulation.ts';
import { inputSeq } from '../../shared/types.ts';
import type { InputPacket, Snapshot, SnapshotEntity, EntityId } from '../../shared/types.ts';
import type { ServerMessage } from '../../shared/network.ts';
import { emitGameEvent } from './events.ts';
import { reconcile } from './net/reconciliation.ts';
import { createChat } from './net/chat.ts';
import { compareWorker, computeFrameP99 } from './profile/worker-experiment.ts';
import { frameProfiler } from './profile/frame-profiler.ts';

const $ = <T extends HTMLElement = HTMLInputElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};
const canvas = $<HTMLCanvasElement>('#game');
let renderer: ReturnType<typeof createRenderer> | null = null;
let input: ReturnType<typeof createInput> | null = null;
let loop: ReturnType<typeof createLoop> | null = null;
let lobby: Lobby | null = null;
let sound: ReturnType<typeof createSoundSystem> | null = null;
let assets: Assets = { images: {}, audio: {}, json: {} };
let roomConfig: RoomInfo = { id: 'training', name: 'Тренувальна арена', width: 960, height: 600, asteroids: 5, players: 0 };
const chat = createChat(document);
function showScreen(name: string) {
  for (const id of ['loading-screen', 'lobby-screen', 'game-screen']) {
    $(`#${id}`).hidden = id !== `${name}-screen`;
  }
}
function showLoadingMessage(value: string) { $('#loading-status').textContent = value; }
const loadingCanvas = $<HTMLCanvasElement>('#loading-canvas');
const loadingCtx = loadingCanvas.getContext('2d')!;
function paintLoading(progress: number) {
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
let loadingController: AbortController | null = null;
async function boot(): Promise<void> {
  loadingController?.abort();
  loadingController = new AbortController();
  const signal = loadingController.signal;
  showScreen('loading');
  $('#retry-load').hidden = true;
  $('#start-load').hidden = true;
  $<HTMLProgressElement>('#loading-bar').value = 0; paintLoading(0);
  showLoadingMessage('Завантаження маніфесту…');
  try {
    const options = { signal,
      onProgress: ({ complete, total, file }: LoadProgress) => {
        $<HTMLProgressElement>('#loading-bar').value = total ? complete / total : 0;
        paintLoading(total ? complete / total : 0);
        $('#loading-count').textContent = `${complete}/${total}`;
        showLoadingMessage(`Завантажено ${file}`);
      },
    };
    assets = await loadAll(options);
    if (signal.aborted) return;
    $<HTMLProgressElement>('#loading-bar').value = 1; paintLoading(1);
    showLobby();
  } catch (error: unknown) {
    if (signal.aborted) return;
    loadingController.abort();
    showLoadingMessage(`Завантаження не вдалося: ${error instanceof Error ? error.message : String(error)}. Натисни Retry, щоб повторити.`);
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
  lobby.addEventListener('join', (event) => {
    if (!(event instanceof CustomEvent)) return;
    const value: unknown = event.detail;
    if (typeof value !== 'object' || value === null || !('room' in value) || !('name' in value)) return;
    const room = RoomSchema.safeParse(value.room);
    if (room.success && typeof value.name === 'string') void startGame({ name: value.name, room: room.data });
  });
  lobby.show();
}
let playerId: EntityId | null = null;
let seq = 0;
let pending: InputPacket[] = [];
let predicted: SnapshotEntity | null = null;
let correction = { x: 0, y: 0 };
let correctionMagnitude = 0;
let accumulator = 0;
let lastSnapshotTime = 0;
let lastTick = 0;
let frames: Snapshot[] = [];
type FakeBullet = Omit<RenderEntity, 'position' | 'velocity'> & { created: number };
let fakeBullets: FakeBullet[] = [];
const fakeBulletPool: FakeBullet[] = [];
const lastFramePositions = new Map<number, { x: number; y: number }>();
const previousById = new Map<number, SnapshotEntity>();
const visibleIds = new Set<number>();
const view = { entities: new Map<number, RenderEntity>(), [Symbol.iterator]() { return this.entities.values(); } };
const socket = chat.socket;

function getImpairment(): void {
  socket.impairment.delay = Math.min(300, Math.max(0, Number($('#latency').value) || 0));
  socket.impairment.jitter = Math.min(150, Math.max(0, Number($('#jitter').value) || 0));
  socket.impairment.loss = Math.min(40, Math.max(0, Number($('#loss').value) || 0));
}
function receiveSnapshot(state: Snapshot): void {
  if (state.tick <= lastTick) return;
  lastTick = state.tick;
  lastSnapshotTime = performance.now();
  frames.push(state);
  if (frames.length > 16) frames.shift();
  const authoritative = state.entities.find((e) => e.id === playerId && e.kind === 'ship');
  if (!authoritative) return;
  const ack = new Map(state.acks).get(playerId!) ?? 0;
  const result = reconcile(authoritative, pending, ack, roomConfig.width, roomConfig.height);
  pending = result.pending;
  const reconciled = $('#predict').value !== 'off' ? result.state : authoritative;
  if (predicted) {
    const dx = shortest(reconciled.x - predicted.x, roomConfig.width);
    const dy = shortest(reconciled.y - predicted.y, roomConfig.height);
    correctionMagnitude = Math.hypot(dx, dy);
    correction = { x: correction.x - dx, y: correction.y - dy };
  } else correction = { x: 0, y: 0 };
  predicted = reconciled;
  $('#hp').textContent = String(authoritative.hp);
  $('#score').textContent = String(authoritative.score);
  $('#deaths').textContent = String(authoritative.deaths);
  $('#speed').textContent = String(Math.round(Math.hypot(authoritative.vx, authoritative.vy)));
  $('#respawn').textContent = authoritative.hp <= 0 ? 'КОРАБЕЛЬ ЗНИЩЕНО · РЕСПАУН ЧЕРЕЗ 2 С' : '';
  $('#entities').textContent = String(state.entities.length);
}
function shortest(n: number, size: number): number {
  return ((n + size / 2) % size + size) % size - size / 2;
}
socket.addEventListener('message', (event) => {
  if (!(event instanceof CustomEvent)) return;
  const message: ServerMessage = event.detail;
  if (message.type === 'joined') {
    playerId = message.playerId;
    seq = 0; pending = []; predicted = null; lastTick = 0; frames = []; fakeBulletPool.push(...fakeBullets); fakeBullets = []; lastFramePositions.clear();
  }
  if (message.type === 'snapshot') receiveSnapshot(message);
  if (message.type === 'gameEvent' && !(message.eventType === 'fired' && message.id === playerId && $('#predict').value !== 'off')) emitGameEvent(message.eventType);
});
async function startGame({ name, room }: { name: string; room: RoomInfo }): Promise<void> {
  roomConfig = room;
  getImpairment(); socket.jsonMode = $('#protocol').value === 'json';
  chat.join(name, room.id);
  try {
    await sound?.dispose();
    sound = createSoundSystem(assets.audio);
    await sound.unlock();
  } catch (error: unknown) { $('#audio-status').textContent = `Звук недоступний: ${error instanceof Error ? error.message : String(error)}`; }
  $('#player-label').textContent = `${name} · ${room.name}`;
  showScreen('game');
  resizeArena(); renderer = createRenderer(canvas, assets.images);
  input?.destroy(); input = createInput();
  window.removeEventListener('resize', onResize);
  window.addEventListener('resize', onResize);
  reset();
  loop?.stop();
  loop = createLoop({ update, render, onStats, onFrame: frameProfiler.frame });
  loop.start();
}
function reset(): void {
  predicted = null; pending = []; correction = { x: 0, y: 0 }; frames = []; lastTick = 0;
}
function update(dt: number): void {
  getImpairment();
  accumulator += dt;
  while (accumulator >= DT) {
    accumulator -= DT;
    if (playerId !== null) {
      const keys = input!.read();
      const command: InputPacket = {
        type: 'input', seq: inputSeq(++seq),
        thrust: !!keys.thrust, left: !!keys.left, right: !!keys.right,
        brake: !!keys.brake, fire: input!.isPressed('KeyF') || input!.isPressed('KeyH'),
        homing: input!.isPressed('KeyH'),
      };
      if (socket.sendInput(command)) {
        if ($('#predict').value !== 'off') {
          pending.push(command);
          if (pending.length > 90) pending.shift();
          if (predicted && predicted.hp > 0) {
            predicted = wrap(
              integrate(predicted, command, DT),
              roomConfig.width, roomConfig.height,
            );
          }
          if (command.fire && predicted && (fakeBullets.length === 0 || performance.now() - fakeBullets[fakeBullets.length - 1]!.created > 225)) {
            const bullet: FakeBullet = fakeBulletPool.pop() ?? { id: 0, kind: 'bullet', x: 0, y: 0, vx: 0, vy: 0, radius: 5, angle: 0, created: 0 };
            Object.assign(bullet, { id: -(seq + 1), x: predicted.x + Math.cos(predicted.angle) * 23, y: predicted.y + Math.sin(predicted.angle) * 23, vx: predicted.vx + Math.cos(predicted.angle) * 510, vy: predicted.vy + Math.sin(predicted.angle) * 510, radius: 5, angle: predicted.angle, created: performance.now(), homing: command.homing });
            fakeBullets.push(bullet);
            emitGameEvent('fired');
          }
        }
      }
    }
  }
  correction.x *= Math.exp(-dt / 0.1);
  correction.y *= Math.exp(-dt / 0.1);
  for (let i = fakeBullets.length - 1; i >= 0; i--) if (performance.now() - fakeBullets[i]!.created >= 220) fakeBulletPool.push(fakeBullets.splice(i, 1)[0]!);
  for (const bullet of fakeBullets) {
    bullet.x = ((bullet.x + bullet.vx * dt) % roomConfig.width + roomConfig.width) % roomConfig.width;
    bullet.y = ((bullet.y + bullet.vy * dt) % roomConfig.height + roomConfig.height) % roomConfig.height;
  }
}
function render(): void {
  if (!renderer || !frames.length) return;
  const latest = frames[frames.length - 1]!;
  const targetTick = Math.min(latest.tick, latest.tick - 3 + Math.max(0, performance.now() - lastSnapshotTime) / (1000 / 30));
  let a = frames[0]!, b = latest;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i]!.tick >= targetTick) { a = frames[i - 1]!; b = frames[i]!; break; }
  }
  const t = a.tick === b.tick ? 1 : Math.max(0, Math.min(1, (targetTick - a.tick) / (b.tick - a.tick)));
  previousById.clear();
  for (const entity of a.entities) previousById.set(entity.id, entity);
  visibleIds.clear();
  const viewport = renderer.getSize();
  const scaleX = viewport.width / roomConfig.width;
  const scaleY = viewport.height / roomConfig.height;
  for (const entity of b.entities) {
    const before = previousById.get(entity.id);
    let stateX = entity.x, stateY = entity.y, stateAngle = entity.angle;
    if (before && before !== entity) {
      const dx = shortest(entity.x - before.x, roomConfig.width);
      const dy = shortest(entity.y - before.y, roomConfig.height);
      stateX = (before.x + dx * t + roomConfig.width) % roomConfig.width;
      stateY = (before.y + dy * t + roomConfig.height) % roomConfig.height;
      const angleDelta = Math.atan2(Math.sin(entity.angle - before.angle), Math.cos(entity.angle - before.angle));
      stateAngle = before.angle + angleDelta * t;
    }
    if (entity.kind === 'ship' && entity.id === playerId && predicted && $('#predict').value !== 'off') {
      const keys = input?.read();
      stateX = ((predicted.x + predicted.vx * accumulator + correction.x) % roomConfig.width + roomConfig.width) % roomConfig.width;
      stateY = ((predicted.y + predicted.vy * accumulator + correction.y) % roomConfig.height + roomConfig.height) % roomConfig.height;
      stateAngle = predicted.angle + (Number(!!keys?.right) - Number(!!keys?.left)) * 3.4 * accumulator;
    }
    const sx = stateX * scaleX, sy = stateY * scaleY;
    const item: RenderEntity = view.entities.get(entity.id) ?? {
      id: entity.id, kind: entity.kind, x: 0, y: 0, vx: 0, vy: 0,
      angle: stateAngle, radius: entity.radius, position: { x: 0, y: 0 },
      previousPosition: { x: 0, y: 0 }, velocity: { x: 0, y: 0 },
    };
    const old = lastFramePositions.get(entity.id);
    item.previousPosition!.x = old?.x ?? sx;
    item.previousPosition!.y = old?.y ?? sy;
    item.position.x = sx; item.position.y = sy;
    item.x = sx; item.y = sy;
    item.vx = entity.vx; item.vy = entity.vy;
    item.angle = stateAngle; item.kind = entity.kind;
    item.radius = entity.radius * Math.min(scaleX, scaleY);
    item.velocity.x = entity.vx * scaleX; item.velocity.y = entity.vy * scaleY;
    item.homing = entity.homing; item.invulnerable = entity.invulnerable;
    item.thrusting = entity.kind === 'ship' && entity.id === playerId && (input?.read().thrust ?? false);
    view.entities.set(entity.id, item); visibleIds.add(entity.id);
    if (old) { old.x = sx; old.y = sy; } else lastFramePositions.set(entity.id, { x: sx, y: sy });
  }
  for (const bullet of fakeBullets) {
    const x = bullet.x * scaleX, y = bullet.y * scaleY;
    const item: RenderEntity = view.entities.get(bullet.id) ?? { ...bullet, position: { x, y }, previousPosition: { x, y }, velocity: { x: 0, y: 0 } };
    item.x = x; item.y = y; item.position.x = x; item.position.y = y;
    item.previousPosition!.x = x; item.previousPosition!.y = y;
    item.velocity.x = bullet.vx * scaleX; item.velocity.y = bullet.vy * scaleY;
    item.radius = bullet.radius * Math.min(scaleX, scaleY);
    view.entities.set(bullet.id, item); visibleIds.add(bullet.id);
  }
  for (const id of view.entities.keys()) if (!visibleIds.has(id)) { view.entities.delete(id); lastFramePositions.delete(id); }
  frameProfiler.beginRender();
  renderer.draw(view, 1);
  frameProfiler.endRender();
}
function onStats(stats: LoopStats): void {
  $('#fps').textContent = String(Math.round(stats.fps));
  $('#steps').textContent = String(30);
  $('#frame-ms').textContent = stats.frameMs.toFixed(1);
  socket.measure();
  $('#net-rtt').textContent = String(Math.round(socket.rtt));
  $('#net-age').textContent = String(lastSnapshotTime ? Math.round(performance.now() - lastSnapshotTime) : 0);
  $('#net-bps').textContent = String(socket.bytesPerSecond);
  $('#net-queue').textContent = String(pending.length);
  $('#net-error').textContent = correctionMagnitude.toFixed(2);
}
function resizeArena(): void {
  if (!roomConfig) return;
  canvas.style.height = `${Math.max(300, Math.min(620, Math.round(canvas.clientWidth * roomConfig.height / roomConfig.width)))}px`;
}
function onResize(): void { resizeArena(); renderer?.resize(); }
$('#reset').addEventListener('click', reset);
$('#leave-room').addEventListener('click', () => {
  loop?.stop(); input?.destroy(); window.removeEventListener('resize', onResize);
  chat.leave(); playerId = null; lobby?.hide(); showLobby();
});

$('#profile-30').addEventListener('click', () => {
  if (frameProfiler.recording) return;
  frameProfiler.start();
  $('#profile-status').textContent = 'Запис 30 с…';
  setTimeout(async () => {
    const data = frameProfiler.stop();
    data.p99 = await computeFrameP99(frameProfiler.samples());
    $('#profile-status').textContent = `p99 ${data.p99.toFixed(1)} мс`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    link.download = `frame-profile-${Date.now()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    console.table(data);
  }, 30000);
});

Object.assign(window, { __arenaDebug: () => frames.at(-1) });
$('#worker-test').addEventListener('click', async () => {
  const result = await compareWorker();
  $('#worker-status').textContent = `main ${result.mainMs.toFixed(1)} / worker ${result.workerMs.toFixed(1)} мс; ${result.keepWorker ? 'worker швидший' : 'залишено main'}`;
  console.table(result);
});
