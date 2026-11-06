import { createPairingCoordinator, PairingError } from './coordinator.mjs';

export function createPairingRoutes({
  coordinator = createPairingCoordinator(),
  waitMs = 25_000,
} = {}) {
  const limits = new Map();
  function rateLimit(req, action) {
    const now = Date.now();
    for (const [key, entry] of limits) if (entry.until <= now) limits.delete(key);
    const key = `${req.socket.remoteAddress}:${action}`;
    let entry = limits.get(key);
    if (!entry) {
      if (limits.size >= 2000) throw new PairingError(429, 'Try later');
      limits.set(key, (entry = { count: 0, until: now + 60_000 }));
    }
    if (++entry.count > (action === 'join' || action === 'create' ? 10 : 120))
      throw new PairingError(429, 'Try later');
  }
  return async (req, res, path, webOrigin) => {
    res.setHeader('Cache-Control', 'no-store');
    // Cross-origin browser clients need explicit origin permission. Native apps have no Origin.
    const origin = req.headers.origin;
    const sameOrigin = origin && origin === `https://${req.headers.host}`;
    const localOrigin = origin && origin === `http://${req.headers.host}`;
    if (origin && origin !== webOrigin && !sameOrigin && !localOrigin) {
      res.writeHead(403);
      res.end('{}');
      return;
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST, OPTIONS' });
      res.end('{}');
      return;
    }
    const send = (value) => {
      if (!res.destroyed && !res.writableEnded) res.end(JSON.stringify(value));
    };
    try {
      const action = path.slice('/api/pairing/'.length);
      if (!['create', 'join', 'code', 'claim', 'command', 'wait', 'leave'].includes(action))
        throw new PairingError(404, 'Not found');
      rateLimit(req, action);
      if (!req.headers['content-type']?.startsWith('application/json'))
        throw new PairingError(415, 'JSON required');
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 2048) throw new PairingError(413, 'Body too large');
      }
      let data;
      try {
        data = JSON.parse(body || '{}');
      } catch {
        throw new PairingError(400, 'Invalid JSON');
      }
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new PairingError(400, 'Invalid body');
      const token = req.headers.authorization?.replace(/^Bearer /, '') || '';
      if (action === 'create') return send(coordinator.create());
      if (action === 'join')
        return send(coordinator.join(typeof data.code === 'string' ? data.code : ''));
      if (action === 'code') return send(coordinator.code(token));
      if (action === 'claim') return send(coordinator.claim(token, data.clientId));
      if (action === 'command') return send(coordinator.command(token, data));
      if (action === 'leave') return send(coordinator.leave(token));
      if (!Number.isSafeInteger(data.afterRevision) || data.afterRevision < -1)
        throw new PairingError(400, 'Invalid revision');
      let unsubscribe = () => {};
      const timer = setTimeout(() => {
        try {
          send(coordinator.snapshot(token));
        } catch {
          res.writeHead(401);
          send({ error: 'Pairing expired' });
        }
        unsubscribe();
      }, waitMs);
      const finish = (value) => {
        clearTimeout(timer);
        unsubscribe();
        send(value);
      };
      res.once('close', () => {
        clearTimeout(timer);
        unsubscribe();
      });
      try {
        unsubscribe = coordinator.watch(token, data.afterRevision, finish);
      } catch (error) {
        clearTimeout(timer);
        throw error;
      }
    } catch (error) {
      res.writeHead(error instanceof PairingError ? error.status : 500);
      send({ error: error instanceof PairingError ? error.message : 'Pairing unavailable' });
    }
  };
}
