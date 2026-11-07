import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactCatalogSnapshot,
  restoreCatalogSnapshot,
} from '../../web/src/app/core/storage/catalog-snapshot.mjs';
const station = (id, countryCode) => ({
  id,
  countryCode,
  name: 'station'.repeat(40),
  country: countryCode,
  genre: '',
  frequency: '',
  streamUrl: 'https://example.com/' + id,
});
test('bounded catalog cache retains favorites and only marks fully retained countries as fresh', () => {
  const ge = [station('ge1', 'GE'), station('ge2', 'GE')];
  const jp = [station('jp1', 'JP'), station('jp2', 'JP')];
  ge[0].duplicateIds = ['saved-alias'];
  const size = (s) => new TextEncoder().encode(JSON.stringify(s)).length;
  const budget = 1024 + 4 + size(ge[0]) + 1 + jp.reduce((n, s) => n + size(s) + 1, 0) + 80;
  const result = compactCatalogSnapshot(
    {
      version: 3,
      stations: [...ge, ...jp],
      countries: { 'GE:2': 1, 'JP:2': 2 },
      index: null,
    },
    ['saved-alias'],
    budget,
  );
  assert.ok(result.stations.some((s) => s.id === 'ge1'));
  assert.ok(result.stations.some((s) => s.id === 'jp1'));
  assert.ok(result.stations.some((s) => s.id === 'jp2'));
  assert.equal(result.countries['JP:2'], 2);
  assert.equal(result.countries['GE:2'], undefined);
  assert.ok(size(result) <= budget);
  assert.equal(new Set(result.stations.map((s) => s.id)).size, result.stations.length);
});
test('legacy stations and small countries remain available offline without duplicate entries', () => {
  const rows = [station('one', 'GE'), station('two', 'GE')];
  const snapshot = { version: 3, stations: rows, countries: {}, index: null };
  assert.deepEqual(compactCatalogSnapshot(snapshot).stations, rows);
  const result = compactCatalogSnapshot({ ...snapshot, countries: { 'GE:2': 10 } }, ['one']);
  assert.equal(result.stations.length, 2);
  assert.equal(result.countries['GE:2'], 10);
});

test('cache migration preserves old station data but never treats static revisions as fresh', () => {
  const rows = [station('one', 'GE')];
  for (const value of [rows, { version: 2, stations: rows, files: { 'GE-static.json': 100 } }]) {
    const result = restoreCatalogSnapshot(value);
    assert.deepEqual(result.stations, rows);
    assert.deepEqual(result.countries, {});
    assert.equal(result.index, null);
  }
});

test('cache restoration rejects malformed stations and sanitizes freshness metadata', () => {
  for (const value of [
    null,
    false,
    'bad',
    {},
    { stations: [null] },
    { stations: [{ id: 'bad' }] },
    { stations: [{ ...station('one', 'GE'), name: '   ' }] },
    { stations: [{ ...station('one', 'GE'), countryCode: 123 }] },
    { stations: [{ ...station('one', 'GE'), duplicateIds: 'alias' }] },
  ])
    assert.equal(restoreCatalogSnapshot(value), null);
  const result = restoreCatalogSnapshot({
    version: 3,
    stations: [station('one', 'GE')],
    countries: { 'GE:1': 100, 'JP:2': '100', '../file': 100 },
    index: { version: 2, countries: [null] },
  });
  assert.deepEqual(result.countries, { 'GE:1': 100 });
  assert.equal(result.index, null);
});
