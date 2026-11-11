export const STEP = 1 / 60;
const ACCELERATION = 300;
const ROTATE_SPEED = 3.4;
const DRAG = 0.32;
const BRAKE_DRAG = 3.8;
const MAX_SPEED = 380;

export function makeShip(width, height) {
  return { x: width / 2, y: height / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
}
export function integrate(ship, input, dt) {
  const angle = ship.angle + (Number(input.right) - Number(input.left)) * ROTATE_SPEED * dt;
  const thrust = input.thrust ? ACCELERATION : 0;
  let vx = ship.vx + Math.cos(angle) * thrust * dt;
  let vy = ship.vy + Math.sin(angle) * thrust * dt;
  const friction = Math.exp(-(input.brake ? BRAKE_DRAG : DRAG) * dt);
  vx *= friction;
  vy *= friction;
  const speed = Math.hypot(vx, vy);
  if (speed > MAX_SPEED) { vx *= MAX_SPEED / speed; vy *= MAX_SPEED / speed; }
  return { x: ship.x + vx * dt, y: ship.y + vy * dt, vx, vy, angle };
}

export function wrapShip(ship, width, height) {
  return { ...ship, x: ((ship.x % width) + width) % width, y: ((ship.y % height) + height) % height };
}
export function interpolateShip(previous, current, alpha, width, height) {
  let dx = current.x - previous.x;
  let dy = current.y - previous.y;
  if (Math.abs(dx) > width / 2) dx -= Math.sign(dx) * width;
  if (Math.abs(dy) > height / 2) dy -= Math.sign(dy) * height;
  return {
    ...current,
    x: ((previous.x + dx * alpha) % width + width) % width,
    y: ((previous.y + dy * alpha) % height + height) % height,
    angle: previous.angle + (current.angle - previous.angle) * alpha,
  };
}
