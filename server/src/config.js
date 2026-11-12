import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function getConfig(env = process.env) {
  const raw = env.PORT ?? '3000';
  if (!/^\d+$/.test(raw)) throw new Error('PORT must be an integer in 1..65535');
  const port = Number(raw);
  if (port < 1 || port > 65535) throw new Error('PORT must be in 1..65535');
  const logsDir = env.LOGS_DIR ?? './logs';
  if (!logsDir.trim() || logsDir.includes('\0')) throw new Error('LOGS_DIR is invalid');
  return { port, logsDir: resolve(env.LOGS_DIR ? logsDir : fileURLToPath(new URL('../../logs/', import.meta.url))), clientDir: resolve(env.CLIENT_DIR ?? fileURLToPath(new URL('../../client/dist/', import.meta.url))) };
}
