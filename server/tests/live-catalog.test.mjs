import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createLiveIndex,
  fetchCountryStations,
  fetchLiveIndex,
} from '../../web/src/app/core/catalog/live-catalog.mjs';
import {
  countriesInArea,
  validCatalogIndex,
} from '../../web/src/app/core/catalog/viewport-catalog.mjs';
const countries = JSON.parse(
  await readFile(new URL('../../web/src/app/shared/data/countries.json', import.meta.url), 'utf8'),
);
const regions = JSON.parse(
  await readFile(
    new URL('../../web/src/app/shared/data/country-regions.json', import.meta.url),
    'utf8',
  ),
);
const row = (id) => ({
  stationuuid: id,
  name: id,
  country: 'Georgia',
  countrycode: 'GE',
  tags: '',
  url_resolved: 'https://example.com/' + id,
});

test('live country counts expose the first station in a previously empty country without static regeneration', async () => {
  let count = 0;
  const fetcher = async (url) => {
    assert.equal(new URL(url).pathname, '/json/countrycodes');
    return { ok: true, json: async () => [{ name: 'GE', stationcount: count }] };
  };
  const before = await fetchLiveIndex(countries, regions, fetcher);
  assert.equal(before.countries.find((c) => c.code === 'GE').count, 0);
  count = 1;
  const after = await fetchLiveIndex(countries, regions, fetcher);
  const ge = after.countries.find((c) => c.code === 'GE');
  assert.equal(ge.count, 1);
  assert.equal(ge.cacheKey, 'GE:1');
  assert.ok(
    countriesInArea(after.countries, { west: 44.7, east: 45, south: 41.5, north: 42 }).some(
      (c) => c.code === 'GE',
    ),
  );
});

test('fresh country requests include newly added stations and never need a bundled station file', async () => {
  let rows = [row('existing')];
  const fetcher = async (url) => {
    const u = new URL(url);
    assert.equal(u.searchParams.get('countrycode'), 'GE');
    assert.equal(u.pathname, '/json/stations/search');
    assert.equal(u.searchParams.has('has_geo_info'), false);
    return { ok: true, json: async () => rows };
  };
  assert.equal((await fetchCountryStations('GE', fetcher)).length, 1);
  rows = [...rows, { ...row('added'), geo_lat: 41.7, geo_long: 44.8 }];
  const result = await fetchCountryStations('GE', fetcher);
  assert.deepEqual(
    result.map((s) => s.id),
    ['existing', 'added'],
  );
  assert.equal(result[1].latitude, 41.7);
});

test('country pagination keeps invalid-row offsets and missing coordinates while deduplicating IDs', async () => {
  const offsets = [];
  const result = await fetchCountryStations('GE', async (url) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    offsets.push(offset);
    return {
      ok: true,
      json: async () =>
        offset === 0
          ? [...Array.from({ length: 999 }, (_, i) => row(String(i))), null]
          : [row('0'), row('new')],
    };
  });
  assert.deepEqual(offsets, [0, 1000]);
  assert.equal(result.length, 1000);
  assert.ok(result.every((s) => s.countryCode === 'GE'));
  assert.equal(result[0].latitude, undefined);
});

test('geographic lookup covers new locations, islands and countries lacking a station history', () => {
  const unknown = createLiveIndex(countries, regions);
  assert.equal(validCatalogIndex(unknown), true);
  const live = createLiveIndex(countries, regions, [
    { code: 'US', count: 1 },
    { code: 'GE', count: 1 },
  ]);
  assert.equal(validCatalogIndex(live), true);
  for (const area of [
    { west: -158, east: -157, south: 21, north: 22 },
    { west: -150, east: -149, south: 60, north: 61 },
    { west: -74, east: -73, south: 40, north: 41 },
  ])
    assert.ok(countriesInArea(live.countries, area).some((c) => c.code === 'US'));
  assert.equal(validCatalogIndex({ version: 2, generatedAt: '', countries: [null] }), false);
  assert.equal(
    validCatalogIndex({ ...live, countries: [{ ...live.countries[0], cacheKey: '../../file' }] }),
    false,
  );
});

test('invalid country counts fail over rather than hiding countries as empty', async () => {
  let calls = 0;
  const index = await fetchLiveIndex(countries, regions, async () => ({
    ok: true,
    json: async () =>
      ++calls === 1
        ? [{ name: 'GE', stationcount: 'bad' }]
        : [
            { name: 'GE', stationcount: '2' },
            { name: 'FR', stationcount: 4 },
          ],
  }));
  assert.equal(calls, 2);
  assert.equal(index.countries.find((c) => c.code === 'GE').count, 2);
  assert.equal(index.countries.find((c) => c.code === 'FR').count, 4);
});

test('missing, boolean, negative and malformed counts are never coerced to valid zero counts', async () => {
  for (const stationcount of [null, undefined, false, '', -1, 'bad', Infinity]) {
    await assert.rejects(
      fetchLiveIndex(countries, regions, async () => ({
        ok: true,
        json: async () => [{ name: 'GE', stationcount }],
      })),
      /Invalid country counts/,
    );
  }
});
