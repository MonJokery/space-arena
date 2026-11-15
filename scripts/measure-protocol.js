import { createArena, addShip, snapshot } from '../shared/simulation.js';
import { encodeInput, encodeSnapshot } from '../shared/protocol.js';
const arena = createArena({ width: 960, height: 600, asteroids: 5 }, 12345);
addShip(arena, 1); addShip(arena, 2);
const state = snapshot(arena, new Map([[1, 43], [2, 46]]));
const input = { type: 'input', seq: 42, thrust: true, left: false, right: false, brake: false, fire: true, homing: false };
const rows = [
  { packet: 'input', json: Buffer.byteLength(JSON.stringify(input)), binary: encodeInput(input).byteLength },
  { packet: 'snapshot (2 ships, 5 asteroids, 2 pickups)', json: Buffer.byteLength(JSON.stringify(state)), binary: encodeSnapshot(state).byteLength },
];
for (const row of rows) {
  console.log(`${row.packet}: JSON ${row.json} B | DataView ${row.binary} B | ${(100 * (1 - row.binary / row.json)).toFixed(1)}% smaller`);
}
