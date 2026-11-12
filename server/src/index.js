import { getConfig } from './config.js';
import { RoomStore } from './room.js';
import { createLogger } from './logger.js';
import { createHttpServer } from './http.js';
import { attachSockets } from './socket.js';

const config = getConfig();
const rooms = new RoomStore();
const logger = await createLogger(config.logsDir);
const server = createHttpServer(config, rooms, logger);
const sockets = attachSockets(server, rooms, logger);
server.on('error', (error) => { console.error('Server error:', error); process.exitCode = 1; });
server.listen(config.port, () => console.log(`Space Arena server: http://localhost:${config.port}`));
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await sockets.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await logger.close();
    process.exitCode = 0;
  } catch (error) { console.error('Shutdown error:', error); process.exitCode = 1; }
}
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
