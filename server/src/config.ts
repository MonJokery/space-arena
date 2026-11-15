import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const Environment = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOGS_DIR: z.string().trim().min(1).refine((s) => !s.includes('\0'), 'Invalid log path').optional(),
  CLIENT_DIR: z.string().trim().min(1).optional(),
});
export type Config = { port: number; logsDir: string; clientDir: string };
export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const data = Environment.parse(env);
  return {
    port: data.PORT,
    logsDir: resolve(data.LOGS_DIR ?? fileURLToPath(new URL('../../logs/', import.meta.url))),
    clientDir: resolve(data.CLIENT_DIR ?? fileURLToPath(new URL('../../client/dist/', import.meta.url))),
  };
}
