import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.mjs';
test('catalog contract, health, CORS and route boundaries', async () => {
  const stations = [{ id: 'demo' }];
  const server = createApp(stations, { webOrigin: 'https://radialla.example' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const r = await fetch(base + '/api/stations', {
      headers: { Origin: 'https://radialla.example' },
    });
    assert.deepEqual(await r.json(), stations);
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://radialla.example');
    assert.equal(
      (
        await fetch(base + '/api/stations', { headers: { Origin: 'https://other.example' } })
      ).headers.get('access-control-allow-origin'),
      null,
    );
    assert.equal((await fetch(base + '/missing')).status, 404);
    assert.equal((await fetch(base + '/api/stations', { method: 'POST' })).status, 405);
    assert.equal((await (await fetch(base + '/api/health')).json()).status, 'ok');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('now-playing exposes metadata only by station UUID and degrades to empty', async () => {
  const id = '01234567-89ab-cdef-0123-456789abcdef';
  const calls = [];
  const server = createApp([], {
    metadataProvider: async (value) => {
      calls.push(value);
      return { artist: 'Artist', title: 'Song' };
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(base + '/api/now-playing?station=' + id);
    assert.deepEqual(await response.json(), { track: { artist: 'Artist', title: 'Song' } });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(base + '/api/now-playing?station=http://127.0.0.1')).status, 400);
    assert.equal((await fetch(base + '/api/now-playing')).status, 400);
    assert.deepEqual(calls, [id]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
