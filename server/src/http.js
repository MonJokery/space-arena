import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, relative, isAbsolute } from 'node:path';
import { pipeline } from 'node:stream/promises';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.wav': 'audio/wav', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const json = (response, status, data) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); };

export function createHttpServer(config, rooms, logger) {
  return createServer(async (request, response) => {
    try {
      const rawPath = (request.url ?? '/').split('?')[0];
      if (/(^|\/)\.\.(\/|$)/.test(rawPath) || /%2e/i.test(rawPath) || /%2f/i.test(rawPath) || /%5c/i.test(rawPath) || rawPath.includes('\\')) { json(response, 403, { error: 'Forbidden path' }); return; }
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/health') {
        json(response, 200, { status: 'ok', rss: process.memoryUsage().rss, uptime: process.uptime() }); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/rooms') { json(response, 200, { rooms: rooms.list() }); return; }
      if (request.method === 'POST' && url.pathname === '/api/rooms') {
        let raw = '';
        for await (const chunk of request) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 2048) { json(response, 413, { error: 'Body too large' }); return; }
        }
        let body;
        try { body = JSON.parse(raw); } catch { json(response, 400, { error: 'Invalid JSON' }); return; }
        const valid = body && typeof body === 'object' && !Array.isArray(body) &&
          Object.keys(body).sort().join(',') === 'asteroids,height,id,name,width' &&
          typeof body.id === 'string' && /^[a-z0-9-]{1,24}$/.test(body.id) &&
          typeof body.name === 'string' && body.name.trim().length > 0 && body.name.length <= 50 &&
          Number.isInteger(body.width) && body.width >= 400 && body.width <= 1920 &&
          Number.isInteger(body.height) && body.height >= 300 && body.height <= 1080 &&
          Number.isInteger(body.asteroids) && body.asteroids >= 0 && body.asteroids <= 30;
        if (!valid) { json(response, 400, { error: 'Invalid room configuration' }); return; }
        const room = rooms.create({ id: body.id, name: body.name.trim(), width: body.width, height: body.height, asteroids: body.asteroids });
        if (!room) { json(response, 409, { error: 'Room already exists' }); return; }
        json(response, 201, { room: { ...room, players: 0 } }); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/replay') {
        try {
          const file = await stat(logger.path);
          response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Length': file.size, 'Cache-Control': 'no-store' });
          await pipeline(createReadStream(logger.path), response);
        } catch (error) { if (!response.headersSent) json(response, error.code === 'ENOENT' ? 404 : 500, { error: 'Replay unavailable' }); }
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') { json(response, 405, { error: 'Method not allowed' }); return; }
      const requested = decodeURIComponent(url.pathname);
      const root = config.clientDir;
      const file = resolve(root, `.${requested === '/' ? '/index.html' : requested}`);
      const rel = relative(root, file);
      if (rel.startsWith('..') || isAbsolute(rel)) { json(response, 403, { error: 'Forbidden path' }); return; }
      try {
        const info = await stat(file);
        if (!info.isFile()) { json(response, 404, { error: 'Not found' }); return; }
        response.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size });
        if (request.method === 'HEAD') response.end();
        else await pipeline(createReadStream(file), response);
      } catch (error) { if (!response.headersSent) json(response, error.code === 'ENOENT' ? 404 : 500, { error: 'Cannot serve file' }); }
    } catch (error) { if (!response.headersSent) json(response, 400, { error: error.message }); }
  });
}
