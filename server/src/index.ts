import { getConfig } from './config.ts';
import { RoomStore } from './room.ts';
import { createLogger } from './logger.ts';
import { createHttpServer } from './http.ts';
import { attachSockets } from './socket.ts';

const config = getConfig();
const rooms = new RoomStore();
const logger = await createLogger(config.logsDir);
const server = createHttpServer(config, rooms, logger);
const sockets = attachSockets(server, rooms, logger);
server.on('error', (error: Error) => { console.error('Server error:', error); process.exitCode = 1; });
server.listen(config.port, () => console.log(`Space Arena server: http://localhost:${config.port}`));
let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await sockets.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await logger.close();
    process.exitCode = 0;
  } catch (error: unknown) { console.error('Shutdown error:', error); process.exitCode = 1; }
}
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
