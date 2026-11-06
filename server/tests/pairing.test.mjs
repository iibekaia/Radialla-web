import test from 'node:test';
import assert from 'node:assert/strict';
import { createPairingCoordinator } from '../pairing/coordinator.mjs';
import { createApp } from '../app.mjs';
import { PairingClient } from '../../web/src/app/core/pairing/pairing-client.mjs';
import { readPairing, writePairing } from '../../web/src/app/core/storage/pairing.mjs';
import { pairingPayload } from '../../web/src/app/core/pairing/pairing-qr.mjs';

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
  assert.ok(second.revision > first.revision);
  assert.equal(event.owner, 'client-bbbbbbbbbbbb');
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
    assert.equal(wait.owner, 'client-bbbbbbbbbbbb');
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

test('two real clients hand playback over both ways only after playbackStarted, and tabs have distinct owners', () =>
  withServer(async (base) => {
    let pausesA = 0;
    let pausesB = 0;
    const a = new PairingClient({ base, pause: () => pausesA++ });
    const b = new PairingClient({ base, pause: () => pausesB++ });
    try {
      const { code } = await a.pair();
      await b.pair(code);
      a.playbackStarted();
      await until(() => a.state.owner === a.clientId && b.state.owner === a.clientId);
      assert.equal(pausesB, 0); // Merely pairing/loading never steals playback.
      b.playbackStarted();
      await until(() => pausesA === 1);
      assert.equal(pausesB, 0);
      a.playbackStarted();
      await until(() => pausesB === 1);
      assert.notEqual(a.clientId, b.clientId);
      await b.leave();
      assert.equal(b.token, null);
      await until(() => a.state.members === 1);
    } finally {
      a.destroy();
      b.destroy();
    }
  }));

test('pending local claim suppresses stale ownership, but a newer competing claim still pauses', async () => {
  let pauses = 0;
  const c = new PairingClient({ base: '/', token: 'token', pause: () => pauses++ });
  let complete;
  c.request = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  c.playbackStarted();
  c.apply({ revision: 2, members: 2, owner: 'other-client' });
  assert.equal(pauses, 0);
  complete({ revision: 3, members: 2, owner: c.clientId });
  await until(() => c.pending === 0);
  c.apply({ revision: 1, members: 2, owner: 'old-client' });
  assert.equal(pauses, 0);
  c.apply({ revision: 4, members: 2, owner: 'new-client' });
  assert.equal(pauses, 1);
  c.destroy();
});

test('server restart invalidates saved credentials without affecting playback', async () => {
  let saved;
  let pauses = 0;
  const c = new PairingClient({
    base: '/',
    token: 'old',
    save: (token) => {
      saved = token;
    },
    pause: () => pauses++,
    fetcher: async () => new Response('{}', { status: 401 }),
  });
  c.playing = true;
  await c.connect();
  assert.equal(saved, null);
  assert.equal(c.token, null);
  assert.equal(pauses, 0);
  c.destroy();
});

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
