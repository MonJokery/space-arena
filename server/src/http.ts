import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, relative, isAbsolute } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { RoomConfigSchema } from './protocol.ts';
import type { RoomStore } from './room.ts';
import type { Config } from './config.ts';
import type { Logger } from './logger.ts';

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.wav': 'audio/wav', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
export function createHttpServer(config: Config, rooms: RoomStore, logger: Logger): Server {
  return createServer(async (request, response) => {
    const json = (status: number, data: unknown): void => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); };
    try {
      const rawPath = (request.url ?? '/').split('?')[0] ?? '/';
      if (/(^|\/)\.\.(\/|$)/.test(rawPath) || /%2e/i.test(rawPath) || /%2f/i.test(rawPath) || /%5c/i.test(rawPath) || rawPath.includes('\\')) { json(403, { error: 'Forbidden path' }); return; }
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/health') { json(200, { status: 'ok', rss: process.memoryUsage().rss, uptime: process.uptime() }); return; }
      if (request.method === 'GET' && url.pathname === '/api/rooms') { json(200, { rooms: rooms.list() }); return; }
      if (request.method === 'POST' && url.pathname === '/api/rooms') {
        let raw = '';
        for await (const chunk of request) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 2048) { json(413, { error: 'Body too large' }); return; }
        }
        let body: unknown;
        try { body = JSON.parse(raw); } catch { json(400, { error: 'Invalid JSON' }); return; }
        const parsed = RoomConfigSchema.safeParse(body);
        if (!parsed.success) { json(400, { error: 'Invalid room configuration' }); return; }
        const room = rooms.create(parsed.data);
        if (!room) { json(409, { error: 'Room already exists' }); return; }
        json(201, { room: { ...room, players: 0 } }); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/replay') {
        try {
          const file = await stat(logger.path);
          response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Length': file.size, 'Cache-Control': 'no-store' });
          await pipeline(createReadStream(logger.path), response);
        } catch (error: unknown) {
          if (!response.headersSent) json(error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 404 : 500, { error: 'Replay unavailable' });
        }
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') { json(405, { error: 'Method not allowed' }); return; }
      const requested = decodeURIComponent(url.pathname);
      const root = config.clientDir;
      const file = resolve(root, `.${requested === '/' ? '/index.html' : requested}`);
      const rel = relative(root, file);
      if (rel.startsWith('..') || isAbsolute(rel)) { json(403, { error: 'Forbidden path' }); return; }
      try {
        const info = await stat(file);
        if (!info.isFile()) { json(404, { error: 'Not found' }); return; }
        response.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size });
        if (request.method === 'HEAD') response.end();
        else await pipeline(createReadStream(file), response);
      } catch (error: unknown) {
        if (!response.headersSent) json(error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 404 : 500, { error: 'Cannot serve file' });
      }
    } catch (error: unknown) { if (!response.headersSent) json(400, { error: error instanceof Error ? error.message : 'Invalid request' }); }
  });
}
