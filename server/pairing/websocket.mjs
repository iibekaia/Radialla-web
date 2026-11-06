import { WebSocketServer, WebSocket } from 'ws';
import { pairingOriginAllowed } from './origin.mjs';

// Credentials travel in the first frame, never in a URL or access log.
export function attachPairingWebSocket(server, coordinator, webOrigin) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  server.on('upgrade', (req, socket, head) => {
    const allowed = pairingOriginAllowed(req, webOrigin);
    if (req.url !== '/api/pairing/socket' || !allowed || sockets.clients.size >= 2000) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit('connection', ws));
  });
  sockets.on('connection', (ws) => {
    let token;
    let unsubscribe = () => {};
    let alive = true;
    const authTimer = setTimeout(() => ws.close(4401, 'Authentication required'), 5000);
    const send = (message) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > 64 * 1024) return ws.terminate();
      ws.send(JSON.stringify(message));
    };
    const publish = () => {
      try {
        send({ type: 'state', state: coordinator.snapshot(token) });
      } catch {
        ws.close(4401, 'Pairing expired');
      }
    };
    ws.on('error', () => {});
    ws.on('pong', () => {
      alive = true;
    });
    ws.on('message', (data, binary) => {
      if (token) return ws.close(4400, 'Already authenticated');
      try {
        if (binary) throw new Error('JSON required');
        const message = JSON.parse(data.toString());
        if (typeof message.token !== 'string' || !/^[a-f0-9]{64}$/.test(message.token))
          return ws.close(4401, 'Invalid credentials');
        coordinator.snapshot(message.token);
        token = message.token;
        unsubscribe = coordinator.subscribe(token, publish);
        clearTimeout(authTimer);
        publish();
      } catch (error) {
        ws.close(
          error.status === 401 ? 4401 : error.status === 429 ? 4429 : 4400,
          'Pairing unavailable',
        );
      }
    });
    const heartbeat = setInterval(() => {
      if (!alive || !token) return ws.terminate();
      alive = false;
      try {
        coordinator.snapshot(token);
        ws.ping();
        send({ type: 'heartbeat' });
      } catch {
        ws.close(4401, 'Pairing expired');
      }
    }, 20_000);
    heartbeat.unref();
    ws.once('close', () => {
      clearTimeout(authTimer);
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
  server.on('close', () => {
    for (const ws of sockets.clients) ws.terminate();
    sockets.close();
  });
}
