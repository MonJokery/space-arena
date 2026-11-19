import { resolve } from 'node:path';
import { z } from 'zod';

const Environment = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOGS_DIR: z.string().min(1).default('./logs'),
  CLIENT_DIR: z.string().min(1).default('./client/dist'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000'),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).max(1000).default(12),
  MAX_ROOMS: z.coerce.number().int().min(1).max(500).default(64),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(1).max(128).default(16),
  GIT_SHA: z.string().max(80).default('local'),
});
export type Config = { port: number; logsDir: string; clientDir: string; allowedOrigins: string[]; maxConnectionsPerIp: number; maxRooms: number; maxPlayersPerRoom: number; gitSha: string };
export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const data = Environment.parse(env);
  const origins = data.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== origin) throw new Error(`Invalid allowed origin: ${origin}`);
  }
  if (!origins.length) throw new Error('ALLOWED_ORIGINS must not be empty');
  return { port: data.PORT, logsDir: resolve(data.LOGS_DIR), clientDir: resolve(data.CLIENT_DIR), allowedOrigins: origins,
    maxConnectionsPerIp: data.MAX_CONNECTIONS_PER_IP, maxRooms: data.MAX_ROOMS,
    maxPlayersPerRoom: data.MAX_PLAYERS_PER_ROOM, gitSha: data.GIT_SHA };
}
