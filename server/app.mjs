import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { createMetadataProvider } from './metadata/stream-metadata.mjs';
import { createStreamRelay } from './streaming/stream-relay.mjs';
export function createApp(stations, config = {}) {
  const metadata = config.metadataProvider || createMetadataProvider();
  const relay = createStreamRelay(config.streamRelay);
  return createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (config.webOrigin && req.headers.origin === config.webOrigin) {
      res.setHeader('Access-Control-Allow-Origin', config.webOrigin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    const requestUrl = new URL(req.url, 'http://localhost');
    const path = requestUrl.pathname;
    if (path === '/api/stream') {
      await relay(requestUrl.searchParams.get('station') || '', res);
      return;
    }
    if (path === '/api/now-playing') {
      res.setHeader('Cache-Control', 'no-store');
      const id = requestUrl.searchParams.get('station') || '';
      if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
        res.writeHead(400);
        res.end(JSON.stringify({ track: null }));
        return;
      }
      try {
        res.end(JSON.stringify({ track: await metadata(id) }));
      } catch {
        res.end(JSON.stringify({ track: null }));
      }
      return;
    }
    if (path === '/api/health') {
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (path === '/api/stations') {
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.end(JSON.stringify(stations));
      return;
    }
    if (config.staticRoot && !path.startsWith('/api/')) {
      const root = resolve(config.staticRoot);
      let file;
      try {
        file = resolve(root, '.' + decodeURIComponent(path));
      } catch {
        res.writeHead(400);
        res.end('{}');
        return;
      }
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403);
        res.end('{}');
        return;
      }
      try {
        const body = await readFile(path === '/' ? resolve(root, 'index.html') : file);
        const mime = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.ico': 'image/x-icon',
          '.webmanifest': 'application/manifest+json',
        };
        res.setHeader(
          'Content-Type',
          mime[extname(path === '/' ? 'index.html' : file)] || 'application/octet-stream',
        );
        res.end(body);
        return;
      } catch {}
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}
