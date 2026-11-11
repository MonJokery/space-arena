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
    // Детермінована зоряна карта без сторонніх бібліотек.
    let seed = 42;
    const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    stars = Array.from({ length: 80 }, () => ({ x: rand() * width, y: rand() * height, size: 0.5 + rand() * 1.7, glow: rand() }));
  }

  function draw(ship, thrust) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#080f25';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(85, 127, 178, 0.11)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    for (const star of stars) { ctx.fillStyle = `rgba(173, 214, 255, ${0.35 + star.glow * 0.55})`; ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2); ctx.fill(); }
    // Копії за краями потрібні, щоб корабель не зникав різко на переході.
    for (const ox of [-width, 0, width]) {
      for (const oy of [-height, 0, height]) {
        ctx.save();
        ctx.translate(ship.x + ox, ship.y + oy);
        ctx.rotate(ship.angle + Math.PI / 2);
        if (thrust) { ctx.fillStyle = '#ffad56'; ctx.beginPath(); ctx.moveTo(-7, 14); ctx.lineTo(0, 28 + Math.random() * 9); ctx.lineTo(7, 14); ctx.fill(); }
        ctx.shadowColor = '#56d6ff'; ctx.shadowBlur = 16;
        ctx.fillStyle = '#153e66'; ctx.strokeStyle = '#6ce7ff'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(15, 15); ctx.lineTo(0, 9); ctx.lineTo(-15, 15); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0; ctx.fillStyle = '#a8fbff'; ctx.beginPath(); ctx.arc(0, -3, 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }
  resize();
  return { draw, resize, getSize: () => ({ width, height }) };
}
