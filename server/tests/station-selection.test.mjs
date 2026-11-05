import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterStations,
  startupStation,
  adjacentStation,
  emptyStationMessage,
} from '../../web/src/app/features/explorer/station-selection.mjs';
const georgia = { code: 'GE', name: 'Georgia' };
const stations = [
  { id: 'ge-1', countryCode: 'ge', country: 'Georgia', streamUrl: 'https://example.com/one' },
  { id: 'fr', countryCode: 'FR', country: 'France', streamUrl: 'https://example.com/two' },
  { id: 'ge-demo', country: 'Georgia', streamUrl: null },
];
test('country and local favorites filters preserve catalog order and support demo country names', () => {
  assert.deepEqual(
    filterStations(stations, georgia).map((s) => s.id),
    ['ge-1', 'ge-demo'],
  );
  assert.deepEqual(
    filterStations(stations, undefined, ['fr', 'ge-1']).map((s) => s.id),
    ['ge-1', 'fr'],
  );
  assert.deepEqual(filterStations(stations, georgia, ['fr']), []);
  assert.deepEqual(filterStations(stations, undefined, []), []);
  assert.deepEqual(filterStations(stations, undefined), stations);
});
test('restored playback takes priority over map results and prefers refreshed station data', () => {
  const saved = { ...stations[0], streamUrl: 'https://old.example/live' };
  assert.equal(startupStation(stations, saved, [stations[1]], null), stations[0]);
  assert.equal(startupStation([], saved, [], null), saved);
  assert.equal(startupStation(stations, null, [stations[1]], null), stations[1]);
  assert.equal(startupStation(stations, null, [], null), undefined);
});
test('skip wraps the current area queue and handles stations outside it and empty lists', () => {
  assert.equal(adjacentStation(stations, 'ge-1', -1), stations[2]);
  assert.equal(adjacentStation(stations, 'ge-demo', 1), stations[0]);
  assert.equal(adjacentStation(stations, 'other', 1), stations[0]);
  assert.equal(adjacentStation(stations, 'other', -1), stations[2]);
  assert.equal(adjacentStation([], 'ge-1', 1), undefined);
});

test('clearing a country restriction restores other countries while preserving local favorites', () => {
  const restricted = filterStations(stations, georgia);
  assert.equal(
    restricted.some((s) => s.id === 'fr'),
    false,
  );
  assert.equal(
    filterStations(stations, undefined).some((s) => s.id === 'fr'),
    true,
  );
  assert.deepEqual(
    filterStations(stations, undefined, ['fr']).map((s) => s.id),
    ['fr'],
  );
  assert.deepEqual(filterStations(stations, { code: 'VA', name: 'Vatican City' }), []);
});

test('empty countries distinguish ongoing catalog loading from no available results', () => {
  assert.deepEqual(emptyStationMessage('Vatican City', false, true, 0), {
    key: 'countryStationsLoading',
    args: ['Vatican City'],
  });
  assert.deepEqual(emptyStationMessage('Vatican City', false, false, 0), {
    key: 'emptyCountryStations',
    args: ['Vatican City'],
  });
  assert.equal(emptyStationMessage('Georgia', false, false, 4).key, 'emptySearch');
  assert.equal(emptyStationMessage('Georgia', true, false, 0).key, 'emptyFavorites');
  assert.equal(emptyStationMessage(undefined, false, false, 0).key, 'emptySearch');
});
