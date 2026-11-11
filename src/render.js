import { interpolateShip } from './physics.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 960;
  let height = 600;
  let stars = [];
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let seed = 42;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    stars = Array.from({ length: 80 }, () => ({ x: random() * width, y: random() * height, size: 0.5 + random() * 1.7, glow: random() }));
  }
  function shipShape(entity) {
    ctx.rotate(entity.angle + Math.PI / 2);
    if (entity.thrusting) {
      ctx.fillStyle = '#ffad56';
      ctx.beginPath(); ctx.moveTo(-7, 14); ctx.lineTo(0, 28 + Math.random() * 9); ctx.lineTo(7, 14); ctx.fill();
    }
    ctx.shadowColor = '#56d6ff'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#153e66'; ctx.strokeStyle = '#6ce7ff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(15, 15); ctx.lineTo(0, 9); ctx.lineTo(-15, 15); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#a8fbff'; ctx.beginPath(); ctx.arc(0, -3, 4, 0, Math.PI * 2); ctx.fill();
  }
  function asteroidShape(entity) {
    ctx.rotate(entity.angle);
    ctx.fillStyle = entity.homing ? '#743a66' : '#364763';
    ctx.strokeStyle = entity.homing ? '#ff82c8' : '#a1b0ca';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const angle = (Math.PI * 2 * i) / 9;
      const radius = entity.radius * (i % 2 ? 0.84 : 1);
      if (i === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (entity.homing) { ctx.fillStyle = '#ffb2dc'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill(); }
  }
  function entityShape(entity) {
    if (entity.kind === 'ship') shipShape(entity);
    if (entity.kind === 'asteroid') asteroidShape(entity);
    if (entity.kind === 'bullet') {
      ctx.shadowColor = entity.homing ? '#f78be1' : '#ffdb82'; ctx.shadowBlur = 13;
      ctx.fillStyle = entity.homing ? '#ff95e9' : '#ffdb82';
      ctx.beginPath(); ctx.arc(0, 0, entity.radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    if (entity.kind === 'pickup') {
      ctx.shadowColor = '#79ffb8'; ctx.shadowBlur = 15; ctx.fillStyle = '#174d3d'; ctx.strokeStyle = '#79ffb8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, entity.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#b2ffd2'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.stroke();
    }
    if (entity.kind === 'particle') {
      ctx.globalAlpha = Math.max(0, entity.ttl / entity.maxTtl);
      ctx.fillStyle = entity.color; ctx.fillRect(-2, -2, 4, 4);
    }
  }
  function draw(world, alpha) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#080f25'; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(85,127,178,0.11)'; ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    for (const star of stars) {
      ctx.fillStyle = `rgba(173,214,255,${0.35 + star.glow * 0.55})`;
      ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2); ctx.fill();
    }
    for (const entity of world) {
      if (entity.dead) continue;
      const from = entity.previousPosition || entity.position;
      const position = interpolateShip({ x: from.x, y: from.y, vx: 0, vy: 0, angle: entity.angle || 0 }, { x: entity.position.x, y: entity.position.y, vx: 0, vy: 0, angle: entity.angle || 0 }, alpha, width, height);
      for (const ox of [-width, 0, width]) for (const oy of [-height, 0, height]) {
        ctx.save(); ctx.translate(position.x + ox, position.y + oy);
        if (entity.kind === 'ship' && entity.invulnerable > 0) ctx.globalAlpha = 0.6;
        entityShape(entity);
        ctx.restore();
      }
    }
  }
  resize();
  return { draw, resize, getSize: () => ({ width, height }) };
}
