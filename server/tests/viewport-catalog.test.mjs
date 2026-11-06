import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ViewportCatalogLoader,
  countriesInArea,
  overviewArea,
  freshTimestamp,
  CATALOG_TTL,
} from '../../web/src/app/core/catalog/viewport-catalog.mjs';
const entry = (code, regions = [[44, 40, 46, 42]]) => ({
  code,
  name: code,
  count: 1,
  latitude: 41,
  longitude: 45,
  cacheKey: `${code}:1`,
  regions,
});
const settle = () => new Promise((resolve) => setImmediate(resolve));
function fixture(cached = new Map()) {
  const jobs = new Map(),
    requests = [],
    received = [],
    loading = [];
  let sequence = 0,
    failures = 0;
  const loader = new ViewportCatalogLoader(
    {
      isCached: (e) => cached.has(e.cacheKey),
      fetch: (e, signal) =>
        new Promise((resolve, reject) => {
          requests.push({ entry: e, signal, resolve, reject });
          signal.addEventListener('abort', () => reject(Error('Aborted')), { once: true });
        }),
      received: (e, stations) => {
        received.push({ entry: e, stations });
        cached.set(e.cacheKey, stations);
      },
      loading: (value) => loading.push(value),
      failed: () => failures++,
    },
    {
      setTimeout: (fn) => {
        jobs.set(++sequence, fn);
        return sequence;
      },
      clearTimeout: (id) => jobs.delete(id),
    },
  );
  return {
    loader,
    requests,
    received,
    loading,
    failures: () => failures,
    flush: () => {
      const pending = [...jobs.values()];
      jobs.clear();
      for (const fn of pending) fn();
    },
  };
}

test('rapid navigation is debounced and only two detail requests run concurrently', async () => {
  const f = fixture();
  f.loader.update([entry('GE')]);
  f.loader.update([entry('JP'), entry('KR'), entry('CN')]);
  f.flush();
  assert.deepEqual(
    f.requests.map((r) => r.entry.code),
    ['JP', 'KR'],
  );
  f.requests[0].resolve([]);
  await settle();
  assert.deepEqual(
    f.requests.map((r) => r.entry.code),
    ['JP', 'KR', 'CN'],
  );
  f.requests[1].resolve([]);
  f.requests[2].resolve([]);
  await settle();
  assert.equal(f.loading.at(-1), false);
  f.loader.update([entry('JP')]);
  f.flush();
  assert.equal(f.requests.length, 3);
  f.loader.destroy();
});

test('moving away aborts stale requests and never merges their late results', async () => {
  const f = fixture();
  f.loader.update([entry('GE'), entry('AM')]);
  f.flush();
  f.loader.update([entry('JP')]);
  f.flush();
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.requests[1].signal.aborted, true);
  await settle();
  assert.equal(f.requests[2].entry.code, 'JP');
  f.requests[2].resolve([{ id: 'japan' }]);
  await settle();
  assert.deepEqual(
    f.received.map((r) => r.entry.code),
    ['JP'],
  );
  assert.equal(f.failures(), 0);
  f.loader.destroy();
});

test('cached countries avoid requests; failures stop and can be retried on new navigation', async () => {
  const ge = entry('GE');
  const f = fixture(new Map([[ge.cacheKey, [{ id: 'saved' }]]]));
  f.loader.update([ge, entry('JP')]);
  f.flush();
  assert.equal(f.requests.length, 1);
  assert.equal(f.received.length, 0);
  f.requests[0].reject(Error('Offline'));
  await settle();
  assert.equal(f.requests.length, 1);
  assert.equal(f.failures(), 1);
  assert.equal(f.loading.at(-1), false);
  f.loader.update([entry('JP')]);
  f.flush();
  assert.equal(f.requests.length, 2);
  f.loader.destroy();
  assert.equal(f.requests[1].signal.aborted, true);
  await settle();
  assert.equal(f.received.length, 0);
});

test('overview does not expand into worldwide detail requests; close view handles wrapped worlds', () => {
  const world = { west: -180, east: 180, south: -70, north: 80 };
  assert.equal(overviewArea(world), true);
  assert.deepEqual(countriesInArea([entry('GE')], world), []);
  const close = { west: 44, east: 46, south: 40, north: 42 };
  assert.deepEqual(
    countriesInArea([entry('GE'), entry('JP', [[138, 34, 140, 36]])], close).map((e) => e.code),
    ['GE'],
  );
  const pacific = entry('FJ', [
    [-180, -20, -178, -16],
    [178, -20, 180, -16],
  ]);
  for (const [west, east] of [
    [170, 190],
    [-190, -170],
    [530, 550],
  ])
    assert.equal(countriesInArea([pacific], { west, east, south: -20, north: -10 }).length, 1);
  assert.deepEqual(
    countriesInArea([entry('GE')], { west: 44, east: 46, south: -10, north: 10 }),
    [],
  );
});

test('an expired in-memory country is fetched again without reloading the page', async () => {
  const cached = new Map();
  const f = fixture(cached);
  const ge = entry('GE');
  f.loader.update([ge]);
  f.flush();
  f.requests[0].resolve([{ id: 'old' }]);
  await settle();
  cached.delete(ge.cacheKey); // The service's freshness window expired.
  f.loader.update([ge]);
  f.flush();
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve([{ id: 'old' }, { id: 'new' }]);
  await settle();
  assert.equal(f.received.at(-1).stations.length, 2);
  f.loader.destroy();
});

test('a changed country count invalidates its cached details immediately', async () => {
  const ge = entry('GE');
  const f = fixture(new Map([[ge.cacheKey, [{ id: 'old' }]]]));
  f.loader.update([ge]);
  f.flush();
  const updated = { ...ge, count: 2, cacheKey: 'GE:2' };
  f.loader.update([updated]);
  f.flush();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].entry.cacheKey, 'GE:2');
  f.requests[0].resolve([{ id: 'old' }, { id: 'new' }]);
  await settle();
  assert.equal(f.received.at(-1).stations.length, 2);
  f.loader.destroy();
});

test('freshness expires at its deadline and rejects future or invalid timestamps', () => {
  const now = 2 * CATALOG_TTL;
  assert.equal(freshTimestamp(now, CATALOG_TTL, now), true);
  assert.equal(freshTimestamp(now - CATALOG_TTL + 1, CATALOG_TTL, now), true);
  assert.equal(freshTimestamp(now - CATALOG_TTL, CATALOG_TTL, now), false);
  for (const timestamp of [now + 1, NaN, undefined, '100'])
    assert.equal(freshTimestamp(timestamp, CATALOG_TTL, now), false);
});
