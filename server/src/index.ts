import { getConfig } from './config.ts';
import { RoomStore } from './room.ts';
import { createLogger } from './logger.ts';
import { createHttpServer } from './http.ts';
import { attachSockets } from './socket.ts';
import { appLog } from './app-log.ts';

const config = getConfig();
const rooms = new RoomStore();
rooms.setLimits(config.maxRooms, config.maxPlayersPerRoom);
const logger = await createLogger(config.logsDir);
let ready = true;
let sockets: ReturnType<typeof attachSockets>;
const server = createHttpServer(config, rooms, logger, () => ready, () => sockets?.peers.size ?? 0);
sockets = attachSockets(server, rooms, logger, config, () => ready);
server.listen(config.port, '0.0.0.0', () => appLog.info({ port: config.port, gitSha: config.gitSha }, 'Server listening'));

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true; ready = false;
  const watchdog = setTimeout(() => { appLog.error('Shutdown exceeded 9 seconds'); process.exit(1); }, 9000);
  watchdog.unref();
  try {
    const closing = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await sockets.close();
    server.closeAllConnections();
    await closing;
    await logger.close();
    clearTimeout(watchdog);
    appLog.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error: unknown) {
    appLog.error({ err: error }, 'Shutdown failed');
    process.exit(1);
  }
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
process.on('uncaughtException', (error) => { appLog.fatal({ err: error }, 'Uncaught exception'); process.exit(1); });
process.on('unhandledRejection', (error) => { appLog.fatal({ err: error }, 'Unhandled rejection'); process.exit(1); });
