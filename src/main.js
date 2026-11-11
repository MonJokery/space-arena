import './style.css';
import { createInput } from './input.js';
import { createLoop } from './loop.js';
import { createRenderer } from './render.js';
import { World } from './world.js';
import { Vector2 } from './vector2.js';
import { Asteroid } from './entities/asteroid.js';
import { Pickup } from './entities/pickup.js';

const $ = (selector) => document.querySelector(selector);
const renderer = createRenderer($('#game'));
const input = createInput();
let { width, height } = renderer.getSize();
let world;
let loop;
function reset() {
  world = new World(width, height);
  world.resetPlayer();
  const obstacles = [
    [0.2, 0.24, 28, 12, 18, false], [0.78, 0.28, -19, 18, 31, false],
    [0.25, 0.78, 14, -13, 26, false], [0.82, 0.77, -8, -18, 32, false],
    [0.55, 0.16, 0, 0, 22, true],
  ];
  for (const [x, y, vx, vy, radius, homing] of obstacles) {
    world.spawn(new Asteroid({ position: new Vector2(width * x, height * y), velocity: new Vector2(vx, vy), radius, homing }));
  }
  world.spawn(new Pickup({ position: new Vector2(width * 0.55, height * 0.76), heal: 30 }));
  world.spawn(new Pickup({ position: new Vector2(width * 0.12, height * 0.55), heal: 30 }));
  world.flush();
  updateHud();
}
function shoot(homing = false) { world.player?.fire(world, homing); }
input.on('KeyF', () => shoot(false));
input.on('KeyH', () => shoot(true));
function updateHud() {
  const ship = world.player;
  $('#hp').textContent = ship ? ship.hp : '0';
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
function draw(alpha) { renderer.draw(world, alpha); }
function onStats(stats) {
  $('#fps').textContent = Math.round(stats.fps);
  $('#steps').textContent = Math.round(stats.sps);
  $('#frame-ms').textContent = stats.frameMs.toFixed(1);
}
function startLoop() {
  loop?.stop();
  loop = createLoop({ update, render: draw, onStats });
  loop.start();
}
$('#reset').addEventListener('click', reset);
window.addEventListener('resize', () => {
  renderer.resize();
  const size = renderer.getSize();
  width = size.width; height = size.height;
  world.width = width; world.height = height;
  for (const entity of world) {
    entity.position = world.wrap(entity.position);
    entity.previousPosition = entity.position;
  }
});
reset();
startLoop();
