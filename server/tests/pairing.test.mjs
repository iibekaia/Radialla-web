import test from 'node:test';
import assert from 'node:assert/strict';
import { createPairingCoordinator } from '../pairing/coordinator.mjs';
import { createApp } from '../app.mjs';
import { PairingClient } from '../../web/src/app/core/pairing/pairing-client.mjs';
import { readPairing, writePairing } from '../../web/src/app/core/storage/pairing.mjs';
import { pairingPayload } from '../../web/src/app/core/pairing/pairing-qr.mjs';
import { WebSocket as TestSocket } from 'ws';
import { once } from 'node:events';

test('codes expire, are single use, and replacement codes revoke the old code', () => {
  let clock = 0;
  const c = createPairingCoordinator({ now: () => clock });
  const first = c.create();
  const next = c.code(first.token);
  assert.throws(() => c.join(first.code), { status: 404 });
  const second = c.join(next.code);
  assert.notEqual(first.token, second.token);
  assert.equal(c.snapshot(first.token).members, 2);
  assert.throws(() => c.join(next.code), { status: 404 });
  const expired = c.code(first.token);
  clock += 300_001;
  assert.throws(() => c.join(expired.code), { status: 404 });
  clock += 24 * 60 * 60_000;
  assert.throws(() => c.snapshot(first.token), { status: 401 });
});

test('groups are isolated, revisions increase, revoked credentials cannot claim, capacity is bounded', () => {
  const c = createPairingCoordinator({ maxGroups: 2 });
  const a = c.create();
  const b = c.join(a.code);
  const outsider = c.create();
  assert.throws(() => c.create(), { status: 503 });
  const first = c.claim(a.token, 'client-aaaaaaaaaaaa');
  let event;
  const stop = c.watch(b.token, first.revision, (state) => {
    event = state;
  });
  const second = c.claim(b.token, 'client-bbbbbbbbbbbb');
  assert.equal(second.revision, first.revision);
  assert.equal(second.owner, null);
  assert.equal(c.snapshot(outsider.token).owner, null);
  stop();
  c.leave(b.token);
  assert.throws(() => c.claim(b.token, 'client-bbbbbbbbbbbb'), { status: 401 });
  assert.equal(c.snapshot(a.token).owner, null);
  assert.equal(c.snapshot(a.token).members, 1);
  assert.throws(() => c.claim(a.token, 'bad'), { status: 400 });
  for (let i = 0; i < 3; i++) c.join(c.code(a.token).code);
  assert.throws(() => c.join(c.code(a.token).code), { status: 409 });
});

async function withServer(run) {
  const server = createApp([], { webOrigin: 'https://web.example', pairing: { waitMs: 100 } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('HTTP pairing authenticates, limits guesses, supports explicit CORS, and does not cache credentials', () =>
  withServer(async (base) => {
    const request = (action, data = {}, token, headers = {}) =>
      fetch(base + '/api/pairing/' + action, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: JSON.stringify(data),
      });
    assert.equal(
      (await request('create', {}, null, { Origin: 'https://evil.example' })).status,
      403,
    );
    const preflight = await fetch(base + '/api/pairing/join', {
      method: 'OPTIONS',
      headers: { Origin: 'https://web.example' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://web.example');
    assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
    const created = await request('create');
    assert.equal(created.headers.get('cache-control'), 'no-store');
    const a = await created.json();
    assert.equal((await request('claim', { clientId: 'client-aaaaaaaaaaaa' })).status, 401);
    assert.equal((await request('wait', { afterRevision: 'invalid' }, a.token)).status, 400);
    assert.equal((await fetch(base + '/api/pairing/create')).status, 405);
    const b = await (await request('join', { code: a.code })).json();
    const ownership = await (
      await request('claim', { clientId: 'client-bbbbbbbbbbbb' }, b.token)
    ).json();
    const wait = await (
      await request('wait', { afterRevision: ownership.revision }, a.token)
    ).json();
    assert.equal(wait.owner, null);
    for (let i = 0; i < 9; i++)
      assert.equal((await request('join', { code: 'invalid' })).status, 404);
    assert.equal((await request('join', { code: 'invalid' })).status, 429);
  }));

async function until(check) {
  const deadline = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Expected state was not received');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('remote controls reach the web over WebSocket with legacy playback claims', () =>
  withServer(async (base) => {
    const requests = [];
    const web = new PairingClient({
      base,
      fetcher: (url, options) => {
        requests.push(url);
        return fetch(url, options);
      },
    });
    const mobile = new PairingClient({ base });
    try {
      const { code } = await web.pair();
      await mobile.pair(code);
      await mobile.request('claim', { clientId: 'legacy-mobile-client' });
      await mobile.request('command', { type: 'play', stationId: 'station-123' });
      await mobile.request('command', {
        type: 'viewport',
        latitude: 41.7,
        longitude: 44.8,
        zoom: 12,
      });
      await until(() => web.state.viewport?.zoom === 12);
      assert.equal(web.state.playback.stationId, 'station-123');
      assert.ok(!requests.some((url) => url.endsWith('/wait')));
      await mobile.request('command', { type: 'pause' });
      await until(() => web.state.playback?.type === 'pause');
      await mobile.leave();
      await until(() => web.state.members === 1);
    } finally {
      web.destroy();
      mobile.destroy();
    }
  }));

test('remote controls validate payloads, require credentials and isolate groups', () => {
  const c = createPairingCoordinator();
  const web = c.create();
  const mobile = c.join(web.code);
  const other = c.create();
  assert.throws(() => c.command('invalid', { type: 'pause' }), { status: 401 });
  for (const command of [
    { type: 'bad' },
    { type: 'play', stationId: '../bad' },
    { type: 'viewport', latitude: 91, longitude: 0, zoom: 12 },
  ])
    assert.throws(() => c.command(mobile.token, command), { status: 400 });
  c.command(mobile.token, { type: 'select', stationId: 'station-1' });
  assert.equal(c.snapshot(web.token).playback.type, 'select');
  assert.equal(c.snapshot(other.token).playback, null);
});

test('server restart invalidates saved WebSocket credentials', () =>
  withServer(async (base) => {
    let saved;
    const c = new PairingClient({
      base,
      token: 'a'.repeat(64),
      save: (token) => {
        saved = token;
      },
    });
    try {
      await c.connect();
      assert.equal(saved, null);
      assert.equal(c.token, null);
    } finally {
      c.destroy();
    }
  }));

test('pairing credentials are scoped to API origin and tolerate blocked browser storage', () => {
  const memory = new Map();
  const storage = () => ({
    getItem: (key) => memory.get(key),
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  });
  const token = 'a'.repeat(64);
  writePairing('https://api.example', token, storage);
  assert.equal(readPairing('https://api.example', storage), token);
  assert.equal(readPairing('https://other.example', storage), null);
  writePairing('https://api.example', null, storage);
  assert.equal(readPairing('https://api.example', storage), null);
  const blocked = () => {
    throw new Error('blocked');
  };
  assert.equal(readPairing('/', blocked), null);
  assert.doesNotThrow(() => writePairing('/', token, blocked));
});

test('QR payload identifies the server and one-time invite, never a durable device token', () => {
  const expiresAt = Date.now() + 300_000;
  const payload = JSON.parse(pairingPayload('/', 'https://radio.example', '12345678', expiresAt));
  assert.deepEqual(payload, {
    type: 'radialla-pairing',
    version: 1,
    apiBaseUrl: 'https://radio.example',
    code: '12345678',
    expiresAt,
  });
  assert.equal(
    JSON.parse(
      pairingPayload('https://api.example/prefix/', 'https://web.example', '12345678', expiresAt),
    ).apiBaseUrl,
    'https://api.example/prefix',
  );
  for (const base of [
    'https://user:password@host.example',
    'javascript:alert(1)',
    'http://public.example',
    'https://api.example?secret=value',
  ])
    assert.throws(() => pairingPayload(base, 'https://web.example', '12345678', expiresAt));
  assert.throws(() => pairingPayload('/', 'https://web.example', 'bad', expiresAt));
  assert.throws(() => pairingPayload('/', 'https://web.example', '12345678', Date.now() - 1));
});

test('WebSocket reconnect restores missed state and revoked tokens disconnect every receiver', () =>
  withServer(async (base) => {
    const connections = [];
    const web = new PairingClient({
      base,
      socketFactory: (url) => {
        const socket = new WebSocket(url);
        connections.push(socket);
        return socket;
      },
    });
    const mobile = new PairingClient({ base });
    try {
      const { code } = await web.pair();
      await mobile.pair(code);
      await until(() => web.connected && mobile.connected);
      assert.equal(mobile.state.receiverOnline, true);
      connections[0].close();
      await until(() => !web.connected && mobile.state.receiverOnline === false);
      assert.equal(mobile.state.members, 2);
      await mobile.request('command', { type: 'play', stationId: 'missed-station' });
      await until(() => web.connected && web.state.playback?.stationId === 'missed-station');
      assert.ok(connections.length >= 2);
      await until(() => mobile.state.receiverOnline === true);
      await web.request('leave');
      await until(() => web.token === null);
      assert.equal(web.connected, false);
      assert.equal(web.state.members, 0);
    } finally {
      web.destroy();
      mobile.destroy();
    }
  }));

test('WebSocket rejects foreign origins and invalid authentication, and isolates paired groups', () =>
  withServer(async (base) => {
    const url = base.replace('http:', 'ws:') + '/api/pairing/socket';
    const denied = new TestSocket(url, { origin: 'https://evil.example' });
    denied.on('error', () => {});
    const [response] = await new Promise((resolve) => {
      denied.on('unexpected-response', (_req, res) => {
        res.resume();
        resolve([res]);
      });
    });
    assert.equal(response.statusCode, 403);
    denied.terminate();

    const invalid = new TestSocket(url, { origin: 'https://web.example' });
    await once(invalid, 'open');
    const rejected = once(invalid, 'close');
    invalid.send(JSON.stringify({ token: 'f'.repeat(64) }));
    assert.equal((await rejected)[0], 4401);

    const web = new PairingClient({ base });
    const other = new PairingClient({ base });
    let extra;
    try {
      await web.pair();
      await other.pair();
      await until(() => web.connected && other.connected);
      extra = new TestSocket(url, { origin: 'https://web.example' });
      await once(extra, 'open');
      const initial = once(extra, 'message');
      extra.send(JSON.stringify({ token: web.token }));
      const snapshot = JSON.parse((await initial)[0].toString()).state;
      const update = once(extra, 'message');
      await web.request('command', { type: 'pause' });
      assert.equal(JSON.parse((await update)[0].toString()).state.playback.type, 'pause');
      assert.equal(other.state.playback, null);
      assert.equal(other.state.revision, snapshot.revision);
      const malformed = once(extra, 'close');
      extra.send('invalid');
      assert.equal((await malformed)[0], 4400);
    } finally {
      extra?.terminate();
      web.destroy();
      other.destroy();
    }
  }));
